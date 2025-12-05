import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de multer para manejar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo JPG, PNG y WEBP'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Inicializar Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Función para procesar imagen: centrar, recortar y agregar marca de agua
async function processImage(base64Image) {
  try {
    const imageBuffer = Buffer.from(base64Image, 'base64');
    const watermarkPath = path.join(__dirname, 'public', 'img', 'Kyndryl_pie.png');
    
    // Procesar imagen principal
    const processedImage = await sharp(imageBuffer)
      .resize(2400, 3600, {
        fit: 'cover',
        position: 'center'
      })
      .png()
      .toBuffer();
    
    // Obtener dimensiones de la marca de agua
    const watermarkInfo = await sharp(watermarkPath).metadata();
    
    // Combinar imagen con marca de agua en la parte inferior
    const finalImage = await sharp(processedImage)
      .composite([{
        input: watermarkPath,
        gravity: 'south'
      }])
      .png()
      .toBuffer();
    
    return finalImage.toString('base64');
  } catch (error) {
    console.error('Error procesando imagen:', error);
    throw error;
  }
}

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint para generar imagen
app.post('/api/generate', upload.single('image'), async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'El prompt es requerido' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'La imagen es requerida' });
    }

    // Leer la imagen del usuario
    const imagePath = req.file.path;
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');

    // Configurar el modelo
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-image"
    });

    // Preparar el contenido para la API
    const parts = [
      { text: prompt },
      {
        inlineData: {
          mimeType: req.file.mimetype,
          data: base64Image
        }
      }
    ];

    console.log('Generando imagen con Nano Banana...');
    
    // Generar la imagen
    const result = await model.generateContent(parts);
    const response = await result.response;

    // Buscar la imagen generada en la respuesta
    let generatedImageBase64 = null;
    
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        generatedImageBase64 = part.inlineData.data;
        break;
      }
    }

    // Limpiar el archivo temporal
    fs.unlinkSync(imagePath);

    if (generatedImageBase64) {
      // Procesar imagen: centrar, recortar y agregar marca de agua
      const processedImageBase64 = await processImage(generatedImageBase64);
      
      // Guardar imagen procesada para descarga via QR
      const imageId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      const generatedDir = path.join(__dirname, 'generated');
      if (!fs.existsSync(generatedDir)) {
        fs.mkdirSync(generatedDir);
      }
      
      const imagePath = path.join(generatedDir, `${imageId}.png`);
      fs.writeFileSync(imagePath, Buffer.from(processedImageBase64, 'base64'));
      
      // URL para el QR
      const imageUrl = `${req.protocol}://${req.get('host')}/download/${imageId}`;
      
      res.json({
        success: true,
        image: `data:image/png;base64,${processedImageBase64}`,
        downloadUrl: imageUrl,
        message: 'Imagen generada y procesada exitosamente'
      });
    } else {
      res.status(500).json({
        error: 'No se pudo generar la imagen',
        details: 'La API no retornó una imagen'
      });
    }

  } catch (error) {
    console.error('Error al generar imagen:', error);
    
    // Limpiar archivo temporal en caso de error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Error al generar la imagen',
      details: error.message
    });
  }
});

// Endpoint para descargar imágenes generadas
app.get('/download/:imageId', (req, res) => {
  try {
    const { imageId } = req.params;
    const imagePath = path.join(__dirname, 'generated', `${imageId}.png`);
    
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="imagen-${imageId}.png"`);
    res.sendFile(imagePath);
  } catch (error) {
    console.error('Error al descargar imagen:', error);
    res.status(500).json({ error: 'Error al descargar la imagen' });
  }
});

// Endpoint de salud
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Nano Banana API está funcionando',
    hasApiKey: !!process.env.GOOGLE_API_KEY
  });
});

// Función para limpiar archivos antiguos (más de 1 hora)
function cleanupOldFiles() {
  const generatedDir = path.join(__dirname, 'generated');
  if (!fs.existsSync(generatedDir)) return;
  
  const files = fs.readdirSync(generatedDir);
  const oneHourAgo = Date.now() - (60 * 60 * 1000); // 1 hora en milisegundos
  
  files.forEach(file => {
    const filePath = path.join(generatedDir, file);
    const stats = fs.statSync(filePath);
    
    if (stats.mtime.getTime() < oneHourAgo) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Archivo eliminado: ${file}`);
    }
  });
}

// Limpiar archivos cada 30 minutos
setInterval(cleanupOldFiles, 30 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🍌 Nano Banana API está lista para generar imágenes`);
  console.log(`📱 QR de descarga habilitado`);
  
  if (!process.env.GOOGLE_API_KEY) {
    console.warn('⚠️  ADVERTENCIA: No se encontró GOOGLE_API_KEY en el archivo .env');
  }
  
  // Limpiar archivos antiguos al iniciar
  cleanupOldFiles();
});

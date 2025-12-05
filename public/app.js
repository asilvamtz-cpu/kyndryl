// Elementos DOM
const cameraBtn = document.getElementById('cameraBtn');
const cameraModal = document.getElementById('cameraModal');
const cameraVideo = document.getElementById('cameraVideo');
const captureBtn = document.getElementById('captureBtn');
const closeCameraBtn = document.getElementById('closeCameraBtn');
const previewContainer = document.getElementById('previewContainer');
const imagePreview = document.getElementById('imagePreview');
const removeBtn = document.getElementById('removeBtn');
const promptInput = document.getElementById('promptInput');
const generateBtn = document.getElementById('generateBtn');
const resultSection = document.getElementById('resultSection');
const resultImage = document.getElementById('resultImage');
const loadingOverlay = document.getElementById('loadingOverlay');
const downloadBtn = document.getElementById('downloadBtn');
const newBtn = document.getElementById('newBtn');
const toast = document.getElementById('toast');
const exampleBtns = document.querySelectorAll('.example-btn');

let cameraStream = null;

// Event Listeners
generateBtn.addEventListener('click', generateImage);
downloadBtn.addEventListener('click', downloadImage);
newBtn.addEventListener('click', reiniciarProceso);

// Mejorar el event listener de la cámara
cameraBtn.addEventListener('click', openCamera);
captureBtn.addEventListener('click', captureImage);
closeCameraBtn.addEventListener('click', closeCamera);

// Cerrar modal con ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cameraModal.style.display === 'block') {
        closeCamera();
    }
});

// Botones de ejemplo
exampleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        promptInput.value = btn.getAttribute('data-prompt');
        checkFormValid();
        promptInput.focus();
    });
});

// Quitar imagen capturada
removeBtn.addEventListener('click', () => {
    imagePreview.src = '';
    previewContainer.style.display = 'none';
    checkFormValid();
});

// Actualiza validación al escribir en el prompt
promptInput.addEventListener('input', checkFormValid);

// Funciones
function dataURLtoFile(dataurl, filename) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
}

function checkFormValid() {
    const hasImage = imagePreview.src && imagePreview.src.startsWith('data:image');
    const hasPrompt = promptInput.value.trim().length > 0;
    generateBtn.disabled = !(hasImage && hasPrompt);
}

// Abrir la cámara con mejor manejo de errores
async function openCamera() {
    try {
        cameraModal.style.display = 'block';
        
        // Verificar si el navegador soporta getUserMedia
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Tu navegador no soporta acceso a la cámara');
        }

        // Solicitar acceso a la cámara con configuración específica
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user' // Cámara frontal por defecto
            }
        };

        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        cameraVideo.srcObject = cameraStream;
        
        // Esperar a que el video esté listo
        cameraVideo.onloadedmetadata = () => {
            cameraVideo.play();
        };
        
    } catch (err) {
        console.error('Error al acceder a la cámara:', err);
        let errorMessage = 'No se pudo acceder a la cámara.';
        
        if (err.name === 'NotAllowedError') {
            errorMessage = 'Permiso denegado. Por favor permite el acceso a la cámara.';
        } else if (err.name === 'NotFoundError') {
            errorMessage = 'No se encontró ninguna cámara en tu dispositivo.';
        } else if (err.name === 'NotReadableError') {
            errorMessage = 'La cámara está siendo usada por otra aplicación.';
        }
        
        showToast(errorMessage, 'error');
        closeCamera();
    }
}

// Capturar imagen con mejor calidad
function captureImage() {
    if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) {
        showToast('Espera a que la cámara esté lista', 'error');
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = cameraVideo.videoWidth;
    canvas.height = cameraVideo.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9); // Mejor calidad
    imagePreview.src = dataUrl;
    previewContainer.style.display = 'block';
    
    closeCamera();
    checkFormValid();
    showToast('Foto capturada exitosamente', 'success');
}

// Cerrar modal de cámara
function closeCamera() {
    cameraModal.style.display = 'none';
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

// Generar imagen usando la imagen capturada
async function generateImage() {
    if (!imagePreview.src || !imagePreview.src.startsWith('data:image')) {
        showToast('La imagen es requerida', 'error');
        imagePreview.classList.add('required');
        setTimeout(() => imagePreview.classList.remove('required'), 1500);
        return;
    }
    if (!promptInput.value.trim()) {
        showToast('Por favor describe tu visión', 'error');
        return;
    }

    loadingOverlay.style.display = 'flex';

    try {
        const formData = new FormData();
        const file = dataURLtoFile(imagePreview.src, 'captured.jpg');
        formData.append('image', file);
        formData.append('prompt', promptInput.value.trim());

        const response = await fetch('/api/generate', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al generar la imagen');
        }

        resultImage.src = data.image;
        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast('¡Imagen generada exitosamente! 🎉', 'success');
        
        // Generar QR con la URL de descarga
        generateQRCode(data.downloadUrl);
    } catch (error) {
        console.error('Error:', error);
        showToast(error.message || 'Error al generar la imagen', 'error');
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

function downloadImage() {
    const nombre = window.nombreUsuario || 'Usuario';
    const fecha = new Date();
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const año = fecha.getFullYear();
    const hora = String(fecha.getHours()).padStart(2, '0');
    const minuto = String(fecha.getMinutes()).padStart(2, '0');
    const segundo = String(fecha.getSeconds()).padStart(2, '0');
    const nombreLimpio = nombre.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]/g, '_');
    const nombreArchivo = `Figura_${nombreLimpio}_AñoNuevo_2026_${dia}-${mes}-${año}_${hora}-${minuto}-${segundo}.png`;
    
    const link = document.createElement('a');
    link.href = resultImage.src;
    link.download = nombreArchivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Imagen descargada', 'success');
}

function resetForm() {
    imagePreview.src = '';
    promptInput.value = '';
    previewContainer.style.display = 'none';
    resultSection.style.display = 'none';
    generateBtn.disabled = true;
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Función para reiniciar completamente el proceso
function reiniciarProceso() {
    // Ocultar todas las secciones
    document.getElementById('generatorContainer').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'none';
    document.getElementById('resultSection').style.display = 'none';
    
    // Limpiar selecciones de avatares
    document.getElementById('avatar-masculino').classList.remove('selected');
    document.getElementById('avatar-femenino').classList.remove('selected');
    document.getElementById('avatar-neutro').classList.remove('selected');
    document.getElementById('img-masculino').src = 'img/Hombre.jpg';
    document.getElementById('img-femenino').src = 'img/Mujer.jpg';
    document.getElementById('img-neutro').src = 'img/Neutro.jpg';
    document.getElementById('next-button').style.display = 'none';
    
    // Limpiar campos
    document.getElementById('user-name').value = '';
    
    // Limpiar selecciones de accesorios
    document.querySelectorAll('.accessory-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    // Reiniciar contador
    const contador = document.getElementById('contador-accesorios');
    if (contador) {
        contador.textContent = '0';
    }
    
    // Ocultar botones de continuar
    document.getElementById('continue-photo-button').style.display = 'none';
    
    // Resetear secciones
    document.getElementById('name-first-section').style.display = 'none';
    document.getElementById('customization-section').style.display = 'none';
    document.getElementById('avatar-section').style.display = 'none';
    
    // Limpiar variables globales
    window.sexoSeleccionado = null;
    window.nombreUsuario = null;
    window.accesoriosSeleccionados = [];
    
    // Resetear términos
    const termsCheckbox = document.getElementById('termsCheckbox');
    const btnTermsNext = document.getElementById('btn-terms-next');
    if (termsCheckbox) termsCheckbox.checked = false;
    if (btnTermsNext) btnTermsNext.disabled = true;
    
    // Resetear formulario de imagen
    resetForm();
    
    // Limpiar QR container
    const qrContainer = document.getElementById('qr-container');
    if (qrContainer) qrContainer.innerHTML = '';
    
    // Mostrar pantalla inicial
    document.getElementById('terms-section').style.display = 'block';
    document.getElementById('inicioContainer').style.display = 'flex';
    
    // Scroll al inicio
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Verificar salud de la API al cargar
async function checkApiHealth() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        
        if (!data.hasApiKey) {
            showToast('⚠️ Configura tu GOOGLE_API_KEY en el archivo .env', 'error');
        }
    } catch (error) {
        console.error('Error al verificar la API:', error);
    }
}

// Función para seleccionar color de piel
function selectSkin(tonoPiel) {
    document.querySelectorAll('.skin-option').forEach(option => {
        option.style.border = '2px solid #e9ecef';
    });
    
    document.querySelectorAll('.skin-option').forEach(option => {
        if (option.getAttribute('onclick').includes(tonoPiel)) {
            option.style.border = '2px solid #434444ff';
        }
    });
    
    window.tonoSeleccionado = tonoPiel;
    document.getElementById('continue-photo-button').style.display = 'block';
}

// Función para abrir directamente la cámara después de seleccionar color de piel
function abrirCamara() {
    document.getElementById('skinSelectionContainer').style.display = 'none';
    document.getElementById('generatorContainer').style.display = 'block';
    setTimeout(() => {
        openCamera();
    }, 100);
}

// Función para continuar a la sección de foto después de seleccionar color de piel
function continuarFoto() {
    document.getElementById('skinSelectionContainer').style.display = 'none';
    document.getElementById('customization-section').style.display = 'none';
    document.getElementById('generatorContainer').style.display = 'block';
}

// Función para generar QR de descarga
function generateQRCode(downloadUrl) {
    const qrContainer = document.getElementById('qr-container');
    if (!qrContainer || !downloadUrl) return;
    
    qrContainer.innerHTML = '';
    qrContainer.style.display = 'block';
    
    const title = document.createElement('h3');
    title.textContent = '📱 Escanea para descargar';
    title.style.color = '#434444';
    title.style.fontSize = '1.1rem';
    title.style.marginBottom = '12px';
    title.style.fontWeight = '600';
    qrContainer.appendChild(title);
    
    try {
        const qrWrapper = document.createElement('div');
        qrWrapper.style.display = 'inline-block';
        qrWrapper.style.padding = '15px';
        qrWrapper.style.background = 'white';
        qrWrapper.style.borderRadius = '15px';
        qrWrapper.style.boxShadow = '0 4px 15px rgba(0,0,0,0.1)';
        qrWrapper.style.border = '2px solid #e9ecef';
        
        const canvas = document.createElement('canvas');
        const qr = new QRious({
            element: canvas,
            value: downloadUrl,
            size: 160,
            margin: 1,
            foreground: '#434444',
            background: 'white'
        });
        
        qrWrapper.appendChild(canvas);
        qrContainer.appendChild(qrWrapper);
        
        const instruction = document.createElement('p');
        instruction.textContent = 'Apunta tu cámara al código QR para descargar';
        instruction.style.color = '#666';
        instruction.style.fontSize = '0.85rem';
        instruction.style.marginTop = '8px';
        instruction.style.marginBottom = '0';
        qrContainer.appendChild(instruction);
        
        console.log('QR generado exitosamente para:', downloadUrl);
        
    } catch (error) {
        console.error('Error generando QR:', error);
        const message = document.createElement('p');
        message.textContent = '⬇️ Usa el botón Descargar para guardar tu imagen';
        message.style.color = '#666';
        message.style.fontSize = '0.9rem';
        message.style.padding = '10px';
        message.style.background = '#f8f9fa';
        message.style.borderRadius = '8px';
        qrContainer.appendChild(message);
    }
}

// Función para volver al inicio al hacer clic en el logo
function volverAlInicio() {
    // Ocultar todas las secciones
    document.getElementById('generatorContainer').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'none';
    document.getElementById('resultSection').style.display = 'none';
    
    // Limpiar selecciones
    document.getElementById('avatar-masculino').classList.remove('selected');
    document.getElementById('avatar-femenino').classList.remove('selected');
    document.getElementById('avatar-neutro').classList.remove('selected');
    document.getElementById('img-masculino').src = 'img/Hombre.jpg';
    document.getElementById('img-femenino').src = 'img/Mujer.jpg';
    document.getElementById('img-neutro').src = 'img/Neutro.jpg';
    document.getElementById('next-button').style.display = 'none';
    
    // Limpiar campos
    document.getElementById('user-name').value = '';
    
    // Limpiar selecciones de accesorios
    document.querySelectorAll('.accessory-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    // Reiniciar contador
    const contador = document.getElementById('contador-accesorios');
    if (contador) {
        contador.textContent = '0';
    }
    
    // Ocultar botones de continuar
    document.getElementById('continue-photo-button').style.display = 'none';
    
    // Resetear secciones
    document.getElementById('name-first-section').style.display = 'none';
    document.getElementById('customization-section').style.display = 'none';
    document.getElementById('avatar-section').style.display = 'none';
    
    // Limpiar variables globales
    window.sexoSeleccionado = null;
    window.nombreUsuario = null;
    window.accesoriosSeleccionados = [];
    
    // Resetear términos
    const termsCheckbox = document.getElementById('termsCheckbox');
    const btnTermsNext = document.getElementById('btn-terms-next');
    if (termsCheckbox) termsCheckbox.checked = false;
    if (btnTermsNext) btnTermsNext.disabled = true;
    
    // Limpiar QR container
    const qrContainer = document.getElementById('qr-container');
    if (qrContainer) qrContainer.innerHTML = '';
    
    // Mostrar pantalla inicial
    document.getElementById('terms-section').style.display = 'block';
    document.getElementById('inicioContainer').style.display = 'flex';
    
    // Scroll al inicio
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Agregar event listener al logo cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
    const logo = document.querySelector('.logo-corner img');
    if (logo) {
        logo.style.cursor = 'pointer';
        logo.addEventListener('click', volverAlInicio);
    }
});

// Ejecutar al cargar la página
checkApiHealth();
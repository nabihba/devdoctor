// --- DOM Elements ---
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const textInput = document.getElementById('textInput');
const submitBtn = document.getElementById('submitBtn');
const cropModal = document.getElementById('cropModal');
const cropImage = document.getElementById('cropImage');
const cancelCrop = document.getElementById('cancelCrop');
const confirmCrop = document.getElementById('confirmCrop');
const loadingState = document.getElementById('loadingState');
const inputCard = document.getElementById('inputCard');
const outputZone = document.getElementById('outputZone');
const whatText = document.getElementById('whatText');
const whereText = document.getElementById('whereText');
const fixText = document.getElementById('fixText');
const copyBtn = document.getElementById('copyBtn');
const expectedResult = document.getElementById('expectedResult');
const resetBtn = document.getElementById('resetBtn');

// --- State Variables ---
let cropper = null;
let croppedBase64 = null;
// Notice: No apiKey variable here! It's safely in the backend now.

// --- 1. Drag and Drop & File Picker Logic ---
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#007BFF'; // Highlight on hover
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '#ccc'; // Reset
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#ccc';
    if (e.dataTransfer.files.length > 0) {
        handleImageUpload(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleImageUpload(e.target.files[0]);
    }
});

// --- 2. Cropper.js Modal Logic ---
function handleImageUpload(file) {
    if (!file.type.startsWith('image/')) {
        alert("Please upload an image file.");
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        cropImage.src = e.target.result;
        cropModal.style.display = 'block'; // Show modal

        if (cropper) cropper.destroy(); // Destroy old instance if exists
        cropper = new Cropper(cropImage, {
            viewMode: 1,
            background: false,
        });
    };
    reader.readAsDataURL(file);
}

cancelCrop.addEventListener('click', () => {
    cropModal.style.display = 'none';
    fileInput.value = ''; // Reset file input
});

confirmCrop.addEventListener('click', () => {
    // Get cropped canvas and convert to base64
    const canvas = cropper.getCroppedCanvas();
    croppedBase64 = canvas.toDataURL('image/jpeg').split(',')[1]; // Strip the data:image prefix for API

    // UI Feedback: Change dropzone text to show image is attached
    dropZone.innerHTML = "<p>✅ Screenshot attached and cropped! Ready to diagnose.</p>";
    cropModal.style.display = 'none';
});

// --- 3. API Logic (Talking to our secure Vercel Backend) ---
submitBtn.addEventListener('click', async () => {
    const problemDescription = textInput.value.trim();

    if (!croppedBase64 && !problemDescription) {
        alert("Please either drop a screenshot or describe your problem.");
        return;
    }

    // Switch UI to Loading
    inputCard.style.display = 'none';
    loadingState.style.display = 'block';
    outputZone.style.display = 'none';

    try {
        await callBackendAPI(problemDescription, croppedBase64);
    } catch (error) {
        alert("An error occurred: " + error.message);
        // Reset UI on error
        loadingState.style.display = 'none';
        inputCard.style.display = 'block';
    }
});

async function callBackendAPI(text, imageBase64) {
    // We hit our own secure serverless function now!
    const response = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text: text,
            imageBase64: imageBase64
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || `Server Error: ${response.status}`);
    }

    populateOutput(data);
}

// --- 4. Output UI Logic ---
function populateOutput(data) {
    loadingState.style.display = 'none';
    outputZone.style.display = 'block';

    if (data.question) {
        whatText.innerText = "Let's narrow this down.";
        whereText.innerText = "Answer the question below and I'll give you the exact fix.";
        fixText.innerText = data.question;
        expectedResult.innerText = '';
        copyBtn.style.display = 'none';

        // Show follow-up input if not already there
        if (!document.getElementById('followUpBox')) {
            const followUp = document.createElement('div');
            followUp.id = 'followUpBox';
            followUp.innerHTML = `
                <textarea id="followUpInput" placeholder="Type your answer here..." rows="2" style="width:100%;margin-top:12px;background:#f4f3f0;border:1.5px solid #e5e3de;border-radius:10px;padding:12px;font-family:'Inter',sans-serif;font-size:0.875rem;resize:none;"></textarea>
                <button id="followUpSubmit" style="margin-top:10px;width:100%;padding:12px;background:#1a1a1a;color:#fff;border:none;border-radius:9px;font-family:'Inter',sans-serif;font-size:0.88rem;font-weight:500;cursor:pointer;">Submit answer</button>
            `;
            document.getElementById('cardFix').appendChild(followUp);

            document.getElementById('followUpSubmit').addEventListener('click', async () => {
                const followUpText = document.getElementById('followUpInput').value.trim();
                if (!followUpText) return;

                // Combine original input with follow up answer
                const combined = (textInput.value.trim() ? textInput.value.trim() + ' ' : '') + followUpText;

                // Remove follow up box
                followUp.remove();

                outputZone.style.display = 'none';
                loadingState.style.display = 'block';
                copyBtn.style.display = 'inline-block';

                try {
                    await callBackendAPI(combined, croppedBase64);
                } catch (error) {
                    alert("An error occurred: " + error.message);
                    loadingState.style.display = 'none';
                    outputZone.style.display = 'block';
                }
            });
        }

    } else {
        whatText.innerText = data.what;
        whereText.innerText = data.where;
        fixText.innerText = data.fix;
        expectedResult.innerText = data.expected;
        copyBtn.style.display = 'inline-block';

        // Remove follow up box if it exists
        const followUp = document.getElementById('followUpBox');
        if (followUp) followUp.remove();
    }
}

// Clipboard Copy
copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(fixText.innerText).then(() => {
        const originalText = copyBtn.innerText;
        copyBtn.innerText = "Copied! ✅";
        setTimeout(() => { copyBtn.innerText = originalText; }, 2000);
    });
});

// Reset Flow
resetBtn.addEventListener('click', () => {
    // Clear data
    croppedBase64 = null;
    textInput.value = '';
    fileInput.value = '';
    dropZone.innerHTML = "<p>Drop your screenshot here or click to upload</p>";

    // Reset UI
    outputZone.style.display = 'none';
    loadingState.style.display = 'none';
    inputCard.style.display = 'block';
});
// How it works modal
document.getElementById('howItWorks').addEventListener('click', () => {
    document.getElementById('howModal').style.display = 'flex';
});

document.getElementById('closeHowModal').addEventListener('click', () => {
    document.getElementById('howModal').style.display = 'none';
});
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

// --- State ---
let cropper = null;
let croppedBase64 = null;

// --- Drop Zone HTML Templates ---
const dropZoneDefault = `
    <div class="drop-inner">
        <div class="drop-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
            </svg>
        </div>
        <p class="drop-title">Drop a screenshot here</p>
        <p class="drop-sub">We'll read the screen and identify the problem</p>
        <label class="upload-btn" for="fileInput">Select file</label>
    </div>
`;

const dropZoneAttached = `
    <div class="drop-inner">
        <div class="drop-icon-wrap" style="background:#eff6ff;border-color:#2563eb;color:#2563eb">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
        </div>
        <p class="drop-title" style="color:#2563eb">Screenshot attached</p>
        <p class="drop-sub">Ready to diagnose</p>
    </div>
`;

// --- 1. Drag and Drop ---
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleImageUpload(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleImageUpload(e.target.files[0]);
});

// --- 2. Cropper ---
function handleImageUpload(file) {
    if (!file.type.startsWith('image/')) {
        alert("Please upload an image file.");
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        cropImage.src = e.target.result;
        cropModal.style.display = 'flex';
        if (cropper) cropper.destroy();
        cropper = new Cropper(cropImage, { viewMode: 1, background: false });
    };
    reader.readAsDataURL(file);
}

cancelCrop.addEventListener('click', () => {
    cropModal.style.display = 'none';
    fileInput.value = '';
    if (cropper) cropper.destroy();
    cropper = null;
});

confirmCrop.addEventListener('click', () => {
    const canvas = cropper.getCroppedCanvas();
    croppedBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    dropZone.innerHTML = dropZoneAttached;
    cropModal.style.display = 'none';
    if (cropper) cropper.destroy();
    cropper = null;
});

// --- 3. Submit ---
submitBtn.addEventListener('click', async () => {
    const problemDescription = textInput.value.trim();
    if (!croppedBase64 && !problemDescription) {
        alert("Please either drop a screenshot or describe your problem.");
        return;
    }
    submitBtn.disabled = true;
    inputCard.style.display = 'none';
    loadingState.style.display = 'block';
    outputZone.style.display = 'none';
    try {
        await callBackendAPI(problemDescription, croppedBase64);
    } catch (error) {
        alert("An error occurred: " + error.message);
        loadingState.style.display = 'none';
        inputCard.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
    }
});

async function callBackendAPI(text, imageBase64) {
    const response = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, imageBase64 })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Server Error: ${response.status}`);
    populateOutput(data);
}

// --- 4. Output ---
function populateOutput(data) {
    loadingState.style.display = 'none';
    outputZone.style.display = 'block';

    if (data.question) {
        whatText.innerText = "Let's narrow this down.";
        whereText.innerText = "Answer the question below and I'll give you the exact fix.";
        fixText.innerText = data.question;
        expectedResult.innerText = '';
        copyBtn.style.display = 'none';

        if (!document.getElementById('followUpBox')) {
            const followUp = document.createElement('div');
            followUp.id = 'followUpBox';
            followUp.innerHTML = `
                <textarea id="followUpInput" placeholder="Type your answer here..." rows="2" style="width:100%;margin-top:12px;background:#f4f3f0;border:1.5px solid #e5e3de;border-radius:10px;padding:12px;font-family:'Inter',sans-serif;font-size:0.875rem;resize:none;"></textarea>
                <button id="followUpSubmit" style="margin-top:10px;width:100%;padding:12px;background:#1a1a1a;color:#fff;border:none;border-radius:9px;font-family:'Inter',sans-serif;font-size:0.88rem;font-weight:500;cursor:pointer;">Submit answer</button>
            `;
            document.getElementById('cardFix').appendChild(followUp);

            document.getElementById('followUpSubmit').addEventListener('click', async () => {
                const followUpBtn = document.getElementById('followUpSubmit');
                const followUpText = document.getElementById('followUpInput').value.trim();
                if (!followUpText) return;
                followUpBtn.disabled = true;
                const combined = (textInput.value.trim() ? textInput.value.trim() + ' ' : '') + followUpText;
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
        whatText.innerText = data.what || 'Could not determine the issue.';
        whereText.innerText = data.where || 'Open your terminal or command prompt.';
        fixText.innerText = data.fix || 'No fix command available.';
        expectedResult.innerText = data.expected || '';
        copyBtn.style.display = 'inline-block';
        const followUp = document.getElementById('followUpBox');
        if (followUp) followUp.remove();
    }
}

// --- Copy ---
copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(fixText.innerText).then(() => {
        const original = copyBtn.innerText;
        copyBtn.innerText = "Copied!";
        setTimeout(() => { copyBtn.innerText = original; }, 2000);
    });
});

// --- Reset ---
resetBtn.addEventListener('click', () => {
    croppedBase64 = null;
    textInput.value = '';
    fileInput.value = '';
    dropZone.innerHTML = dropZoneDefault;
    outputZone.style.display = 'none';
    loadingState.style.display = 'none';
    inputCard.style.display = 'block';
    copyBtn.style.display = 'inline-block';
    const followUp = document.getElementById('followUpBox');
    if (followUp) followUp.remove();
});

// --- How it works ---
document.getElementById('howItWorks').addEventListener('click', () => {
    document.getElementById('howModal').style.display = 'flex';
});

document.getElementById('closeHowModal').addEventListener('click', () => {
    document.getElementById('howModal').style.display = 'none';
});
// In-memory rate limit store (resets on cold start, good enough for V1)
const requests = new Map();

function isRateLimited(ip) {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    const max = 5; // 5 requests per minute per IP

    if (!requests.has(ip)) requests.set(ip, []);

    const timestamps = requests.get(ip).filter(t => now - t < windowMs);
    timestamps.push(now);
    requests.set(ip, timestamps);

    return timestamps.length > max;
}

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Rate limiting
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    if (isRateLimited(ip)) {
        return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
    }

    const { text, imageBase64 } = req.body;

    // Input validation
    if (!text && !imageBase64) {
        return res.status(400).json({ error: 'Please provide a description or screenshot.' });
    }

    if (text && typeof text !== 'string') {
        return res.status(400).json({ error: 'Invalid input.' });
    }

    if (text && text.length > 2000) {
        return res.status(400).json({ error: 'Text input is too long. Please keep it under 2000 characters.' });
    }

    if (imageBase64 && imageBase64.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'Image is too large. Please use a smaller screenshot.' });
    }

    // Sanitize text — strip any HTML or script tags
    const sanitizedText = text ? text.replace(/<[^>]*>/g, '').trim() : null;

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const systemInstruction = `You are an empathetic technical support agent helping a complete beginner. ALWAYS respond in valid JSON format. 
        If given a specific error or screenshot, respond with: { "what": "plain English explanation", "where": "numbered steps to open terminal based on detected OS", "fix": "the exact command", "expected": "what they will see when it works" }. 
        If the input is vague, respond with: { "question": "Your simple multiple choice question here without technical jargon" }.`;

        const parts = [];
        if (sanitizedText) parts.push({ text: sanitizedText });
        if (imageBase64) {
            parts.push({
                inline_data: { mime_type: "image/jpeg", data: imageBase64 }
            });
        }

        const payload = {
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: [{ parts: parts }],
            generationConfig: { responseMimeType: "application/json" }
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'Failed to connect to AI');
        }

        const resultText = data.candidates[0].content.parts[0].text;
        const resultObj = JSON.parse(resultText);

        return res.status(200).json(resultObj);

    } catch (error) {
        console.error("Backend Error:", error);
        return res.status(500).json({ error: 'Failed to process diagnosis. Please try again.' });
    }
}
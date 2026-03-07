export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { text, imageBase64 } = req.body;

    // Vercel securely injects this variable from your project settings
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
    }

    try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const systemInstruction = `You are an empathetic technical support agent helping a complete beginner. ALWAYS respond in valid JSON format. 
        If given a specific error or screenshot, respond with: { "what": "plain English explanation", "where": "numbered steps to open terminal based on detected OS", "fix": "the exact command", "expected": "what they will see when it works" }. 
        If the input is vague, respond with: { "question": "Your simple multiple choice question here without technical jargon" }.`;

        const parts = [];
        if (text) parts.push({ text: text });
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

        // The server makes the call to Google, keeping your key hidden
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

        // Send the clean JSON back to your frontend
        return res.status(200).json(resultObj);

    } catch (error) {
        console.error("Backend Error:", error);
        return res.status(500).json({ error: 'Failed to process diagnosis.' });
    }
}
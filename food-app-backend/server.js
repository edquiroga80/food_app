require("dotenv").config();
const express = require("express");
const axios = require("axios");
const multer = require("multer");
const cors = require("cors");

const app = express();
app.use(cors());
const port = process.env.PORT || 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

if (!GEMINI_API_KEY) {
  console.error("❌ Falta GEMINI_API_KEY en .env o entorno de Render.");
  process.exit(1);
}

app.get("/", (req, res) => {
  res.send("✅ Backend funcionando correctamente.");
});

app.post("/analyze-food", upload.single("foodImage"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded." });
  }

  try {
    const imageBase64 = req.file.buffer.toString("base64");

    const promptText = `Analiza la imagen de este plato de comida. Identifica los principales ingredientes.
Luego, proporciona una estimación de su información nutricional general: calorías totales aproximadas, gramos de proteína y gramos de grasa.
Formatea tu respuesta estrictamente como un único objeto JSON con las siguientes claves: "platoDescripcion" (string), "ingredientes" (array de strings), "calorias" (string o number), "proteinas" (string o number), "grasas" (string o number).
No incluyas explicaciones, introducciones, conclusiones ni texto adicional. Solo responde con el objeto JSON puro.`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: req.file.mimetype,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    };

    console.log("📤 Enviando solicitud a Gemini API...");

    const response = await axios.post(GEMINI_API_URL, requestBody, {
      headers: { "Content-Type": "application/json" },
    });

    const parts = response.data?.candidates?.[0]?.content?.parts;
    const analysisResultText = parts?.[0]?.text || "";
    console.log("📥 Texto crudo devuelto por Gemini:", analysisResultText);

    let analysisResultJson = null;

    // Intento 1: Parseo directo
    try {
      analysisResultJson = JSON.parse(analysisResultText);
    } catch {
      // Intento 2: extraer bloque entre ```json ``` y ```
      const jsonRegex = /```json\s*([\s\S]*?)\s*```/i;
      const match = analysisResultText.match(jsonRegex);
      if (match?.[1]) {
        try {
          analysisResultJson = JSON.parse(match[1]);
        } catch {}
      }

      // Intento 3: buscar por llaves
      if (!analysisResultJson) {
        const firstBrace = analysisResultText.indexOf("{");
        const lastBrace = analysisResultText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          try {
            const potentialJson = analysisResultText.slice(
              firstBrace,
              lastBrace + 1
            );
            analysisResultJson = JSON.parse(potentialJson);
          } catch {}
        }
      }
    }

    if (
      analysisResultJson &&
      typeof analysisResultJson === "object" &&
      !analysisResultJson.error
    ) {
      return res.json({ analysis: analysisResultJson });
    } else {
      return res.status(500).json({
        error: "No se pudo extraer un JSON válido de la respuesta de Gemini.",
        rawResponse: analysisResultText,
      });
    }
  } catch (error) {
    console.error("❌ Error general en /analyze-food:");
    if (error.response) {
      console.error("🔁 Error de API Gemini:", error.response.data);
      return res.status(error.response.status || 500).json({
        error:
          error.response.data?.error?.message || "Error desconocido de Gemini.",
      });
    } else {
      return res.status(500).json({
        error: "Falla interna del servidor.",
        details: error.message,
      });
    }
  }
});

app.listen(port, () => {
  console.log(`🚀 Backend escuchando en http://localhost:${port}`);
});

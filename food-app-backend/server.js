require("dotenv").config();
const express = require("express");
const axios = require("axios");
const multer = require("multer");

const app = express();
const cors = require("cors");
app.use(cors());
const port = process.env.PORT || 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

if (!GEMINI_API_KEY) {
  console.error("Falta GEMINI_API_KEY en .env o entorno de Render.");
  process.exit(1);
}

app.get("/", (req, res) => {
  res.send("Backend funcionando correctamente.");
});

app.post("/analyze-food", upload.single("foodImage"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded." });

  try {
    const imageBase64 = req.file.buffer.toString("base64");

    const promptText = `Analiza la imagen de este plato de comida... (omitido aquí por brevedad)`;

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

    console.log("Enviando solicitud a Gemini API...");
    const response = await axios.post(GEMINI_API_URL, requestBody, {
      headers: { "Content-Type": "application/json" },
    });

    // 🔍 NUEVO LOG: Respuesta completa
    console.log(
      "Respuesta completa de Gemini:",
      JSON.stringify(response.data, null, 2)
    );

    let analysisResultText = "";
    if (
      response.data.candidates &&
      response.data.candidates[0].content &&
      response.data.candidates[0].content.parts &&
      response.data.candidates[0].content.parts[0]
    ) {
      analysisResultText = response.data.candidates[0].content.parts[0].text;
    } else {
      return res.status(500).json({
        error: "Estructura de respuesta inesperada de la API de Gemini.",
      });
    }

    let analysisResultJson = null;

    try {
      analysisResultJson = JSON.parse(analysisResultText);
    } catch (e) {
      const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
      const match = analysisResultText.match(jsonRegex);
      if (match && match[1]) {
        try {
          analysisResultJson = JSON.parse(match[1]);
        } catch {}
      }

      if (!analysisResultJson) {
        const firstBrace = analysisResultText.indexOf("{");
        const lastBrace = analysisResultText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          try {
            analysisResultJson = JSON.parse(
              analysisResultText.substring(firstBrace, lastBrace + 1)
            );
          } catch {}
        }
      }

      if (!analysisResultJson || typeof analysisResultJson !== "object") {
        analysisResultJson = {
          error: "La respuesta de Gemini no contenía JSON parseable.",
          rawResponse: analysisResultText,
        };
      }
    }

    if (analysisResultJson && !analysisResultJson.error) {
      res.json({ analysis: analysisResultJson });
    } else {
      res.status(500).json(
        analysisResultJson.error
          ? analysisResultJson
          : {
              error: "Error procesando la respuesta de Gemini.",
              rawResponse: analysisResultText,
            }
      );
    }
  } catch (error) {
    console.error("Error general en /analyze-food:");
    if (error.response) {
      console.error("Error de API Gemini:", error.response.data);
      res.status(error.response.status || 500).json({
        error:
          error.response.data?.error?.message ||
          "Error desconocido de la API de Gemini.",
      });
    } else {
      res.status(500).json({
        error: "Falla interna del servidor.",
        details: error.message,
      });
    }
  }
});

app.listen(port, () => {
  console.log(`Backend escuchando en http://localhost:${port}`);
});

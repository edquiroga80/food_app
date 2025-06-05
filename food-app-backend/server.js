// food-app-backend/server.js

require("dotenv").config(); // Para cargar variables de entorno desde .env
const express = require("express");
const axios = require("axios");
const multer = require("multer");
const fs = require("fs"); // File system, aunque no lo estamos usando activamente para guardar archivos con memoryStorage

const app = express();
const port = process.env.PORT || 3000;

// Configuración de Multer para guardar la imagen en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.json()); // Para parsear JSON del body de solicitudes (no tan relevante para FormData pero buena práctica)
//app.use(express.static("../food-app-frontend")); // Sirve los archivos estáticos del frontend (ajusta la ruta si es necesario)

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// URL actualizada para un modelo de Gemini más reciente y compatible con visión
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

if (!GEMINI_API_KEY) {
  console.error(
    "Error: La variable de entorno GEMINI_API_KEY no está configurada."
  );
  console.log(
    "Asegúrate de tener un archivo .env en la carpeta food-app-backend con tu clave API."
  );
  console.log("Ejemplo de .env:");
  console.log("GEMINI_API_KEY=TU_CLAVE_API_AQUI");
  process.exit(1); // Detiene la aplicación si la clave API no está configurada
}

app.post("/analyze-food", upload.single("foodImage"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded." });
  }

  try {
    const imageBase64 = req.file.buffer.toString("base64");

    // Prompt mejorado para solicitar explícitamente solo el objeto JSON
    const promptText = `Analiza la imagen de este plato de comida. Identifica los principales ingredientes.
Luego, proporciona una estimación de su información nutricional general: calorías totales aproximadas, gramos de proteína y gramos de grasa.
Formatea tu respuesta estrictamente como un único objeto JSON con las siguientes claves: "platoDescripcion" (string), "ingredientes" (array of strings), "calorias" (string o number), "proteinas" (string o number), "grasas" (string o number).
No incluyas ningún texto explicativo, introducciones, conclusiones, notas adicionales, ni utilices formato markdown (como \`\`\`json). Tu respuesta debe ser únicamente el objeto JSON en sí.`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: req.file.mimetype, // ej: 'image/jpeg', 'image/png'
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json", // Solicita explícitamente JSON como tipo de respuesta
        temperature: 0.3, // Un poco menos creativo para respuestas más consistentes
      },
    };

    console.log("Enviando solicitud a Gemini API...");
    const response = await axios.post(GEMINI_API_URL, requestBody, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    // La API (si respeta responseMimeType: "application/json") debería devolver directamente el JSON en response.data.candidates[0].content.parts[0].text
    // o incluso response.data.candidates[0].content.parts[0].json (revisar estructura de respuesta)
    // Sin embargo, a veces Gemini aún puede envolverlo o fallar en ser estrictamente JSON.

    let analysisResultText = "";
    if (
      response.data.candidates &&
      response.data.candidates[0].content &&
      response.data.candidates[0].content.parts &&
      response.data.candidates[0].content.parts[0]
    ) {
      analysisResultText = response.data.candidates[0].content.parts[0].text;
    } else {
      console.error(
        "Estructura de respuesta inesperada de Gemini:",
        response.data
      );
      return res
        .status(500)
        .json({
          error: "Estructura de respuesta inesperada de la API de Gemini.",
        });
    }

    console.log("Respuesta cruda (texto) de Gemini:", analysisResultText);

    let analysisResultJson = null;

    // Intento 1: Parsear directamente (ideal si Gemini respeta responseMimeType y no añade texto extra)
    try {
      analysisResultJson = JSON.parse(analysisResultText);
      console.log("JSON parseado directamente con éxito.");
    } catch (e) {
      console.warn(
        "Intento 1 fallido: La respuesta de Gemini no es un JSON directo. Intentando extraer..."
      );

      // Intento 2: Extraer JSON de un bloque de código markdown (por si acaso)
      const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
      const match = analysisResultText.match(jsonRegex);

      if (match && match[1]) {
        try {
          analysisResultJson = JSON.parse(match[1]);
          console.log(
            "JSON extraído del bloque de código markdown y parseado con éxito."
          );
        } catch (parseError) {
          console.error(
            "Error al parsear el JSON extraído del bloque de código markdown:",
            parseError.message
          );
          // Continuar al siguiente intento si este falla
        }
      }

      // Intento 3: Si los anteriores fallaron, buscar el primer '{' y el último '}'
      if (!analysisResultJson) {
        // Solo si los intentos anteriores no funcionaron
        const firstBrace = analysisResultText.indexOf("{");
        const lastBrace = analysisResultText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const potentialJson = analysisResultText.substring(
            firstBrace,
            lastBrace + 1
          );
          try {
            analysisResultJson = JSON.parse(potentialJson);
            console.log(
              "JSON extraído por llaves delimitadoras y parseado con éxito."
            );
          } catch (parseError) {
            console.error(
              "Error al parsear el JSON extraído por llaves delimitadoras:",
              parseError.message
            );
            // Si este también falla, analysisResultJson seguirá siendo null o el último error.
          }
        }
      }

      // Si después de todos los intentos, analysisResultJson sigue siendo null o no es un objeto, es un error.
      if (!analysisResultJson || typeof analysisResultJson !== "object") {
        console.warn(
          "No se pudo extraer un objeto JSON válido de la respuesta de Gemini después de varios intentos."
        );
        analysisResultJson = {
          error:
            "La respuesta de Gemini no contenía un formato JSON reconocible o parseable.",
          rawResponse: analysisResultText,
        };
      }
    }

    // Enviar el resultado al frontend
    if (analysisResultJson && !analysisResultJson.error) {
      res.json({ analysis: analysisResultJson });
    } else {
      // Si analysisResultJson tiene la estructura de error que creamos, la usamos.
      // De lo contrario, creamos un error más genérico.
      const errorPayload =
        analysisResultJson && analysisResultJson.error
          ? analysisResultJson
          : {
              error: "Error procesando la respuesta de Gemini.",
              rawResponse: analysisResultText,
            };
      res.status(500).json(errorPayload);
    }
  } catch (error) {
    console.error("Error general en la ruta /analyze-food:");
    if (error.response) {
      // Error desde la API de Gemini (ej. error de autenticación, cuota excedida, etc.)
      console.error(
        "Datos del error de Axios:",
        JSON.stringify(error.response.data, null, 2)
      );
      console.error("Status del error de Axios:", error.response.status);
      const apiErrorMsg =
        error.response.data.error && error.response.data.error.message
          ? error.response.data.error.message
          : "Error desconocido de la API de Gemini.";
      res
        .status(error.response.status || 500)
        .json({ error: `Error de la API de Gemini: ${apiErrorMsg}` });
    } else if (error.request) {
      // La solicitud se hizo pero no se recibió respuesta
      console.error(
        "Error de solicitud de Axios (sin respuesta):",
        error.message
      );
      res
        .status(500)
        .json({ error: "No se recibió respuesta del servicio de Gemini." });
    } else {
      // Algo más causó el error
      console.error("Error de configuración o desconocido:", error.message);
      res
        .status(500)
        .json({ error: `Falla interna del servidor: ${error.message}` });
    }
  }
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});

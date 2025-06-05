// food-app-frontend/script.js

document.addEventListener("DOMContentLoaded", () => {
  const imageInput = document.getElementById("foodImageInput");
  const imagePreview = document.getElementById("imagePreview");
  const analyzeButton = document.getElementById("analyzeButton");
  const loadingIndicator = document.getElementById("loadingIndicator");
  const resultsSection = document.getElementById("resultsSection");
  const foodDescriptionElem = document.getElementById("foodDescription");
  const caloriesElem = document.getElementById("calories");
  const proteinElem = document.getElementById("protein");
  const fatElem = document.getElementById("fat");
  const rawResponseElem = document.getElementById("rawResponse");
  const rawResponseLabel = document.getElementById("rawResponseLabel"); // Asumiendo que tienes un label con este ID

  let selectedFile = null;

  imageInput.addEventListener("change", (event) => {
    selectedFile = event.target.files[0];
    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        imagePreview.src = e.target.result;
        imagePreview.style.display = "block";
      };
      reader.readAsDataURL(selectedFile);
      analyzeButton.disabled = false;
      resultsSection.style.display = "none"; // Ocultar resultados anteriores al seleccionar nueva imagen
      // Limpiar campos de resultados anteriores
      foodDescriptionElem.textContent = "";
      caloriesElem.textContent = "---";
      proteinElem.textContent = "---";
      fatElem.textContent = "---";
      if (rawResponseElem) rawResponseElem.textContent = "";
      if (rawResponseLabel) rawResponseLabel.style.display = "none";
    } else {
      imagePreview.style.display = "none";
      analyzeButton.disabled = true;
    }
  });

  analyzeButton.addEventListener("click", async () => {
    if (!selectedFile) {
      alert("Por favor, selecciona una imagen primero.");
      return;
    }

    loadingIndicator.style.display = "block";
    resultsSection.style.display = "none";
    analyzeButton.disabled = true;

    // Limpiar campos de resultados antes de una nueva análisis
    foodDescriptionElem.textContent = "";
    caloriesElem.textContent = "---";
    proteinElem.textContent = "---";
    fatElem.textContent = "---";
    if (rawResponseElem) {
      rawResponseElem.textContent = "";
      rawResponseElem.style.display = "none"; // Ocultar por defecto, mostrar solo si hay datos o para debug
    }
    if (rawResponseLabel) rawResponseLabel.style.display = "none";

    const formData = new FormData();
    formData.append("foodImage", selectedFile);

    try {
      const response = await fetch("/analyze-food", {
        method: "POST",
        body: formData,
        // No necesitas 'Content-Type' aquí, FormData lo establece automáticamente
      });

      // Intentamos parsear como JSON independientemente del status,
      // ya que el backend podría enviar un JSON con un mensaje de error.
      const data = await response.json();

      if (!response.ok) {
        // Si el backend envió un error (ej. status 500),
        // 'data.error' debería tener el mensaje del backend.
        // 'data.rawResponse' podría tener la respuesta cruda de Gemini si el backend la incluyó.
        let errorMessage =
          data.error || `Error del servidor: ${response.status}`;
        if (data.rawResponse) {
          if (rawResponseElem) {
            rawResponseElem.textContent = `Respuesta cruda del error del backend:\n${data.rawResponse}`;
            rawResponseElem.style.display = "block";
          }
          if (rawResponseLabel) rawResponseLabel.style.display = "block";
        }
        throw new Error(errorMessage);
      }

      // Si llegamos aquí, response.ok es true y data debería ser el JSON del análisis
      if (data.analysis) {
        const analysis = data.analysis;

        if (analysis.error) {
          // El backend pudo procesar la solicitud pero hubo un error específico en el análisis
          // (ej. Gemini no devolvió JSON parseable, y el backend lo indicó en analysis.error)
          foodDescriptionElem.textContent = `Error en el análisis de datos: ${analysis.error}`;
          if (analysis.rawResponse && rawResponseElem) {
            rawResponseElem.textContent = `Respuesta cruda de Gemini (vía backend):\n${analysis.rawResponse}`;
            rawResponseElem.style.display = "block";
            if (rawResponseLabel) rawResponseLabel.style.display = "block";
          }
        } else {
          // ¡Éxito! Mostrar los datos del análisis
          foodDescriptionElem.textContent =
            analysis.platoDescripcion || "No se proporcionó descripción.";

          caloriesElem.textContent =
            analysis.calorias !== undefined ? String(analysis.calorias) : "N/A";
          proteinElem.textContent =
            analysis.proteinas !== undefined
              ? String(analysis.proteinas)
              : "N/A";
          fatElem.textContent =
            analysis.grasas !== undefined ? String(analysis.grasas) : "N/A";

          // Opcional: Mostrar el JSON completo para depuración, si se desea
          // if (rawResponseElem) {
          //     rawResponseElem.textContent = JSON.stringify(analysis, null, 2);
          //     rawResponseElem.style.display = 'block';
          // }
          // if (rawResponseLabel) rawResponseLabel.style.display = 'block';
        }
      } else {
        foodDescriptionElem.textContent =
          "No se recibieron datos de análisis válidos del servidor.";
        if (rawResponseElem) {
          rawResponseElem.textContent = JSON.stringify(data, null, 2); // Mostrar la data completa que se recibió
          rawResponseElem.style.display = "block";
        }
        if (rawResponseLabel) rawResponseLabel.style.display = "block";
      }

      resultsSection.style.display = "block";
    } catch (error) {
      // Captura errores de red, o errores lanzados desde el bloque try (ej. !response.ok)
      console.error("Error en el análisis (fetch o procesamiento):", error);
      foodDescriptionElem.textContent = `Error: ${error.message}`;
      // Asegurarse de que los campos numéricos estén en estado de error
      caloriesElem.textContent = "---";
      proteinElem.textContent = "---";
      fatElem.textContent = "---";
      resultsSection.style.display = "block"; // Mostrar la sección de resultados para que se vea el error
    } finally {
      loadingIndicator.style.display = "none";
      analyzeButton.disabled = false; // Habilitar de nuevo el botón
    }
  });
});

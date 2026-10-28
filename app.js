/**
 * ============================================================================
 * FitTrack - Diario de Entrenamientos (CRUD con Supabase)
 * ============================================================================
 * Archivo: app.js
 * Descripción: Manejo completo del estado, eventos del DOM y operaciones
 *              asíncronas con Supabase (Create, Read, Update, Delete).
 * ============================================================================
 */

// ============================================================================
// 1. CREDENCIALES DE SUPABASE
// ============================================================================
// IMPORTANTE: Coloca aquí tu URL del proyecto y tu anon key pública de Supabase
const SUPABASE_URL = "https://yxggmiznjocxajaqhifl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4Z2dtaXpuam9jeGFqYXFoaWZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNzUwMzAsImV4cCI6MjEwODc1MTAzMH0.OeaY2CQGshqzxBKEuACJLNS0SzPbvxXksShYuHGwZjM";

// ============================================================================
// 2. INICIALIZACIÓN DEL CLIENTE SUPABASE
// ============================================================================
let supabaseClient = null;

if (typeof supabase !== "undefined" && SUPABASE_URL && SUPABASE_ANON_KEY) {
  // Inicialización con persistSession: false según los requisitos
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false
    }
  });
}

// ============================================================================
// 3. REFERENCIAS AL DOM Y ESTADO LOCAL
// ============================================================================
const dom = {
  form: document.getElementById("workout-form"),
  trainingId: document.getElementById("training-id"),
  ejercicio: document.getElementById("ejercicio"),
  series: document.getElementById("series"),
  repeticiones: document.getElementById("repeticiones"),
  peso: document.getElementById("peso"),
  fecha: document.getElementById("fecha"),

  formTitle: document.getElementById("form-title"),
  editBadge: document.getElementById("edit-badge"),
  btnSubmit: document.getElementById("btn-submit"),
  btnSubmitText: document.getElementById("btn-submit-text"),
  btnCancel: document.getElementById("btn-cancel"),

  workoutList: document.getElementById("workout-list"),
  workoutCount: document.getElementById("workout-count"),
  loadingState: document.getElementById("loading-state"),
  emptyState: document.getElementById("empty-state"),
  tableWrapper: document.getElementById("table-wrapper"),
  toastContainer: document.getElementById("toast-container"),
  configBanner: document.getElementById("config-banner")
};

// Almacén en memoria de los entrenamientos actuales para edición rápida
let workoutsCache = [];
let isSubmitting = false;

// ============================================================================
// 4. SISTEMA DE NOTIFICACIONES (TOASTS)
// ============================================================================
/**
 * Muestra un mensaje flotante tipo Toast.
 * @param {string} message - Texto del mensaje a mostrar.
 * @param {'success'|'error'|'warning'} [type='success'] - Tipo de notificación.
 * @param {number} [duration=4000] - Tiempo en ms antes de desaparecer.
 */
function showToast(message, type = "success", duration = 4000) {
  if (!dom.toastContainer) return;

  const icons = {
    success: "✓",
    error: "✕",
    warning: "⚠️"
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || "•"}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;

  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("fade-out");
    toast.addEventListener("transitionend", () => {
      toast.remove();
    });
  }, duration);
}

/**
 * Escapa cadenas para prevenir inyecciones HTML en el renderizado.
 */
function escapeHtml(str) {
  if (!str && str !== 0) return "";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

// ============================================================================
// 5. OPERACIONES CRUD CON SUPABASE
// ============================================================================

/**
 * Comprueba que las credenciales de Supabase estén configuradas.
 * @returns {boolean}
 */
function checkSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !supabaseClient) {
    if (dom.configBanner) {
      dom.configBanner.style.display = "block";
    }
    showToast(
      "Configura SUPABASE_URL y SUPABASE_ANON_KEY en app.js para conectar con la base de datos.",
      "warning",
      6000
    );
    return false;
  }
  if (dom.configBanner) {
    dom.configBanner.style.display = "none";
  }
  return true;
}

/**
 * READ: Obtiene todos los entrenamientos ordenados por fecha descendente.
 */
async function fetchWorkouts() {
  if (!checkSupabaseConfig()) {
    renderWorkouts([]);
    return;
  }

  try {
    setLoading(true);

    const { data, error } = await supabaseClient
      .from("entrenamientos")
      .select("*")
      .order("fecha", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      throw error;
    }

    workoutsCache = data || [];
    renderWorkouts(workoutsCache);
  } catch (err) {
    console.error("Error al obtener entrenamientos:", err);
    showToast(`Error al cargar datos: ${err.message || err}`, "error");
    renderWorkouts([]);
  } finally {
    setLoading(false);
  }
}

/**
 * CREATE / UPDATE: Guarda un nuevo entrenamiento o actualiza uno existente.
 */
async function handleFormSubmit(event) {
  event.preventDefault();

  if (isSubmitting) return;
  if (!checkSupabaseConfig()) return;

  // Extracción y saneamiento de valores del formulario
  const trainingId = dom.trainingId.value.trim();
  const ejercicio = dom.ejercicio.value.trim();
  const series = parseInt(dom.series.value, 10);
  const repeticiones = parseInt(dom.repeticiones.value, 10);
  const pesoVal = dom.peso.value.trim();
  const peso = pesoVal === "" ? null : parseFloat(pesoVal);
  const fecha = dom.fecha.value || getTodayDateString();

  // Validaciones del cliente
  if (!ejercicio) {
    showToast("Por favor, ingresa el nombre del ejercicio.", "warning");
    dom.ejercicio.focus();
    return;
  }

  if (isNaN(series) || series <= 0) {
    showToast("Las series deben ser un número mayor a 0.", "warning");
    dom.series.focus();
    return;
  }

  if (isNaN(repeticiones) || repeticiones <= 0) {
    showToast("Las repeticiones deben ser un número mayor a 0.", "warning");
    dom.repeticiones.focus();
    return;
  }

  if (peso !== null && (isNaN(peso) || peso < 0)) {
    showToast("El peso no puede ser negativo.", "warning");
    dom.peso.focus();
    return;
  }

  // Estructura de datos para PostgreSQL
  const payload = {
    ejercicio,
    series,
    repeticiones,
    peso,
    fecha
  };

  try {
    isSubmitting = true;
    setButtonSubmitting(true);

    if (trainingId) {
      // ----------------------------------------------------
      // UPDATE: Modificar entrenamiento existente
      // ----------------------------------------------------
      const { data, error } = await supabaseClient
        .from("entrenamientos")
        .update(payload)
        .eq("id", trainingId)
        .select();

      if (error) throw error;

      showToast(`Entrenamiento "${ejercicio}" actualizado con éxito.`);
    } else {
      // ----------------------------------------------------
      // CREATE: Insertar nuevo entrenamiento
      // ----------------------------------------------------
      const { data, error } = await supabaseClient
        .from("entrenamientos")
        .insert([payload])
        .select();

      if (error) throw error;

      showToast(`Entrenamiento "${ejercicio}" registrado con éxito.`);
    }

    // Limpiar formulario y restablecer a modo inserción
    resetForm();

    // Actualizar lista de entrenamientos
    await fetchWorkouts();
  } catch (err) {
    console.error("Error al guardar entrenamiento:", err);
    showToast(`Error al guardar: ${err.message || err}`, "error");
  } finally {
    isSubmitting = false;
    setButtonSubmitting(false);
  }
}

/**
 * DELETE: Elimina un registro de Supabase tras confirmación nativa.
 * @param {number|string} id - ID del entrenamiento.
 * @param {string} exerciseName - Nombre del ejercicio para el prompt.
 */
async function deleteWorkout(id, exerciseName) {
  if (!checkSupabaseConfig()) return;

  const confirmed = window.confirm(
    `¿Estás seguro de que deseas eliminar el entrenamiento "${exerciseName}"?`
  );

  if (!confirmed) return;

  try {
    const { error } = await supabaseClient
      .from("entrenamientos")
      .delete()
      .eq("id", id);

    if (error) throw error;

    showToast(`Entrenamiento "${exerciseName}" eliminado.`);

    // Si estábamos editando justo el registro que se eliminó, cancelamos la edición
    if (dom.trainingId.value === String(id)) {
      resetForm();
    }

    // Refrescar lista
    await fetchWorkouts();
  } catch (err) {
    console.error("Error al eliminar entrenamiento:", err);
    showToast(`Error al eliminar: ${err.message || err}`, "error");
  }
}

/**
 * Carga los datos de un entrenamiento en el formulario para editarlo.
 * @param {number|string} id - ID del entrenamiento.
 */
function startEditWorkout(id) {
  const item = workoutsCache.find((w) => String(w.id) === String(id));
  if (!item) {
    showToast("No se encontró el entrenamiento para editar.", "error");
    return;
  }

  // Llenar campos del formulario
  dom.trainingId.value = item.id;
  dom.ejercicio.value = item.ejercicio || "";
  dom.series.value = item.series || "";
  dom.repeticiones.value = item.repeticiones || "";
  dom.peso.value = item.peso !== null && item.peso !== undefined ? item.peso : "";
  dom.fecha.value = item.fecha ? item.fecha.slice(0, 10) : getTodayDateString();

  // Cambiar textos y aspecto a modo Edición
  dom.formTitle.textContent = "Editar Entrenamiento";
  dom.editBadge.style.display = "inline-block";
  dom.btnSubmitText.textContent = "Actualizar Entrenamiento";
  dom.btnCancel.style.display = "inline-flex";

  // Hacer scroll suave hacia el formulario
  dom.form.scrollIntoView({ behavior: "smooth", block: "start" });
  dom.ejercicio.focus();
}

/**
 * Cancela la edición y devuelve el formulario a su estado original.
 */
function resetForm() {
  dom.form.reset();
  dom.trainingId.value = "";
  dom.fecha.value = getTodayDateString();

  dom.formTitle.textContent = "Nuevo Entrenamiento";
  dom.editBadge.style.display = "none";
  dom.btnSubmitText.textContent = "Guardar Entrenamiento";
  dom.btnCancel.style.display = "none";
}

// ============================================================================
// 6. RENDERIZADO Y CONTROL DE LA INTERFAZ (UI)
// ============================================================================

/**
 * Renderiza la lista/tabla de entrenamientos.
 * @param {Array} workouts - Lista de entrenamientos desde Supabase.
 */
function renderWorkouts(workouts) {
  dom.workoutList.innerHTML = "";

  const total = workouts ? workouts.length : 0;
  dom.workoutCount.textContent = `${total} ${total === 1 ? "registro" : "registros"}`;

  if (total === 0) {
    dom.tableWrapper.style.display = "none";
    dom.emptyState.style.display = "flex";
    return;
  }

  dom.emptyState.style.display = "none";
  dom.tableWrapper.style.display = "block";

  workouts.forEach((item) => {
    const tr = document.createElement("tr");

    // Formato de peso
    const pesoDisplay =
      item.peso !== null && item.peso !== undefined
        ? `<span class="table-weight">${escapeHtml(item.peso)} kg</span>`
        : `<span class="table-weight-null">—</span>`;

    // Formato de fecha para visualización (DD/MM/AAAA)
    const formattedDate = formatDateDisplay(item.fecha);

    tr.innerHTML = `
      <td class="table-date">${escapeHtml(formattedDate)}</td>
      <td class="table-exercise">${escapeHtml(item.ejercicio)}</td>
      <td class="text-center"><span class="table-stat-badge">${escapeHtml(item.series)}</span></td>
      <td class="text-center"><span class="table-stat-badge">${escapeHtml(item.repeticiones)}</span></td>
      <td class="text-right">${pesoDisplay}</td>
      <td class="text-right">
        <div class="actions-cell">
          <button 
            type="button" 
            class="btn btn-action btn-edit" 
            data-id="${item.id}"
            title="Editar este entrenamiento"
          >
            Editar
          </button>
          <button 
            type="button" 
            class="btn btn-action btn-delete" 
            data-id="${item.id}" 
            data-name="${escapeHtml(item.ejercicio)}"
            title="Eliminar este entrenamiento"
          >
            Eliminar
          </button>
        </div>
      </td>
    `;

    dom.workoutList.appendChild(tr);
  });
}

/**
 * Muestra u oculta el spinner de carga.
 */
function setLoading(isLoading) {
  if (isLoading) {
    dom.loadingState.style.display = "flex";
    dom.emptyState.style.display = "none";
    dom.tableWrapper.style.display = "none";
  } else {
    dom.loadingState.style.display = "none";
  }
}

/**
 * Cambia el estado del botón de envío durante peticiones de red.
 */
function setButtonSubmitting(submitting) {
  dom.btnSubmit.disabled = submitting;
  if (submitting) {
    dom.btnSubmit.style.opacity = "0.7";
    dom.btnSubmit.style.cursor = "wait";
    dom.btnSubmitText.textContent = "Guardando...";
  } else {
    dom.btnSubmit.style.opacity = "1";
    dom.btnSubmit.style.cursor = "pointer";
    dom.btnSubmitText.textContent = dom.trainingId.value
      ? "Actualizar Entrenamiento"
      : "Guardar Entrenamiento";
  }
}

/**
 * Obtiene la fecha actual en formato ISO (YYYY-MM-DD) ajustada a la zona horaria local.
 */
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Convierte una fecha YYYY-MM-DD en formato legible para la tabla.
 */
function formatDateDisplay(dateStr) {
  if (!dateStr) return "—";
  // Evitar desajustes de zona horaria parseando las partes directamente
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

// ============================================================================
// 7. DELEGACIÓN DE EVENTOS Y ARRANQUE DE LA APLICACIÓN
// ============================================================================

/**
 * Maneja los clics en los botones de "Editar" y "Eliminar" en la tabla.
 */
dom.workoutList.addEventListener("click", (event) => {
  const target = event.target;

  // Botón Editar
  const editBtn = target.closest(".btn-edit");
  if (editBtn) {
    const id = editBtn.getAttribute("data-id");
    startEditWorkout(id);
    return;
  }

  // Botón Eliminar
  const deleteBtn = target.closest(".btn-delete");
  if (deleteBtn) {
    const id = deleteBtn.getAttribute("data-id");
    const name = deleteBtn.getAttribute("data-name") || "entrenamiento";
    deleteWorkout(id, name);
  }
});

// Envío del formulario (Crear / Actualizar)
dom.form.addEventListener("submit", handleFormSubmit);

// Botón Cancelar edición
dom.btnCancel.addEventListener("click", resetForm);

// Inicialización de la aplicación al cargar el DOM
document.addEventListener("DOMContentLoaded", () => {
  // Establecer fecha por defecto a hoy
  dom.fecha.value = getTodayDateString();

  // Si no se han configurado credenciales, mostrar advertencia visual
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    checkSupabaseConfig();
  }

  // Cargar registros iniciales
  fetchWorkouts();
});


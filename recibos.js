const firebaseConfig = {
    apiKey: "AIzaSyCwBZMUnQ6rH3APMo4kXDiDvg_u7Zsud9w",
    authDomain: "lavanderia-nueva.firebaseapp.com",
    databaseURL: "https://lavanderia-nueva-default-rtdb.firebaseio.com",
    projectId: "lavanderia-nueva",
    storageBucket: "lavanderia-nueva.appspot.com",
    messagingSenderId: "1074532951",
    appId: "1:1074532951:web:311703f9f5441d11240912"
};

const PRECIOS_SERVICIO = {
    Básico: 20,
    Premium: 25,
    Express: 30
};

const formatoMoneda = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN"
});

const $ = id => document.getElementById(id);

let database = null;
let guardando = false;
let compartiendo = false;
let totalModificadoManualmente = false;
let archivoRecibo = null;
let preparandoImagen = null;
let reciboActual = null;
let solicitudPendiente = null;
let ultimoContenidoGuardado = "";
let mayorFolioConocido = 0;

function dinero(valor) {
    return formatoMoneda.format(Number(valor) || 0);
}

function redondear(valor) {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function numero(valor) {
    const resultado = Number(valor);
    return Number.isFinite(resultado) && resultado >= 0 ? resultado : 0;
}

function escapar(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[caracter]);
}

function fechaLocal(fecha = new Date()) {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    return `${anio}-${mes}-${dia}`;
}

function mostrarFecha(valor) {
    if (!valor) return "";
    const [anio, mes, dia] = valor.split("-").map(Number);
    return new Date(anio, mes - 1, dia).toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function formatoHora(valor) {
    if (!valor) return "";
    const [hora, minutos] = valor.split(":");
    const h = Number(hora);
    return `${h % 12 || 12}:${minutos} ${h >= 12 ? "PM" : "AM"}`;
}

function avisar(texto, desplazar = false) {
    $("mensaje").textContent = texto;
    if (desplazar) {
        $("mensaje").scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    }
}

function cambiarBotonGenerar(ocupado) {
    $("btnGenerar").disabled = ocupado;
    $("btnGenerar").innerHTML = ocupado
        ? "<span>Guardando…</span>"
        : `<span>Generar recibo</span>
           <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
               <path d="M5 12h14M13 6l6 6-6 6"></path>
           </svg>`;
}

function cambiarBotonCompartir(texto, deshabilitado = false) {
    $("btnCompartir").disabled = deshabilitado;
    $("btnCompartir").innerHTML = `
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M12 15V3m-4 4 4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"></path>
        </svg>
        <span>${escapar(texto)}</span>
    `;
}

function obtenerPrendas(selector, especiales = false) {
    return [...document.querySelectorAll(selector)]
        .map(input => ({
            nombre: input.dataset.nombre,
            cantidad: numero(input.value),
            ...(especiales ? { precio: numero(input.dataset.precio) } : {})
        }))
        .filter(prenda => prenda.cantidad > 0);
}

function obtenerCalculo() {
    const servicio = $("servicio").value;
    const kilos = numero($("kilos").value);
    const precioKilo = PRECIOS_SERVICIO[servicio] || 0;
    const prendasEspeciales = obtenerPrendas(".especial-jc", true);
    const subtotalRopa = redondear(kilos * precioKilo);
    const subtotalEspeciales = redondear(
        prendasEspeciales.reduce(
            (suma, prenda) => suma + prenda.cantidad * prenda.precio,
            0
        )
    );
    const tipoDomicilio = $("tipoDomicilio").value;
    const precioDomicilio = tipoDomicilio
        ? numero($("precioDomicilio").value)
        : 0;

    return {
        servicio,
        kilos,
        precioKilo,
        prendasEspeciales,
        subtotalRopa,
        subtotalEspeciales,
        tipoDomicilio,
        precioDomicilio,
        subtotal: redondear(
            subtotalRopa + subtotalEspeciales + precioDomicilio
        )
    };
}

function actualizarTotalVista() {
    $("totalVista").textContent = dinero($("total").value);
}

function calcularTotal() {
    if (!totalModificadoManualmente) {
        $("total").value = obtenerCalculo().subtotal.toFixed(2);
    }
    actualizarTotalVista();
}

function sincronizarDomicilio() {
    const activo = Boolean($("tipoDomicilio").value);
    $("precioDomicilio").disabled = !activo;
    if (!activo) $("precioDomicilio").value = "0";
}

function activarCalculoAutomatico() {
    const recalcular = () => {
        totalModificadoManualmente = false;
        calcularTotal();
    };

    $("servicio").addEventListener("change", recalcular);
    $("kilos").addEventListener("input", recalcular);
    $("precioDomicilio").addEventListener("input", recalcular);

    document.querySelectorAll(".especial-jc").forEach(input => {
        input.addEventListener("input", recalcular);
    });

    $("tipoDomicilio").addEventListener("change", () => {
        sincronizarDomicilio();
        recalcular();
    });

    $("total").addEventListener("input", () => {
        totalModificadoManualmente = true;
        actualizarTotalVista();
    });

    $("recalcular").addEventListener("click", () => {
        recalcular();
        avisar("Total actualizado con los precios del servicio.");
    });

    $("fechaIngreso").addEventListener("change", () => {
        $("fechaEntrega").min = $("fechaIngreso").value;
    });

    $("formRecibo").addEventListener("submit", evento => {
        evento.preventDefault();
        generarRecibo();
    });

    sincronizarDomicilio();
    calcularTotal();
}

async function mostrarUltimoFolio() {
    const valorInicial = $("folio").value;

    try {
        const snapshot = await database.ref("recibos").once("value");
        let mayor = 0;

        snapshot.forEach(child => {
            const valor = String(child.val()?.folio ?? "");
            if (/^\d+$/.test(valor)) {
                const folio = Number(valor);
                if (Number.isSafeInteger(folio)) {
                    mayor = Math.max(mayor, folio);
                }
            }
        });

        mayorFolioConocido = Math.max(mayorFolioConocido, mayor);
        $("ultimoFolio").textContent =
            `Último folio registrado: ${mayorFolioConocido}`;

        if ($("folio").value === valorInicial && !guardando && !reciboActual) {
            $("folio").value = mayorFolioConocido + 1;
        }
    } catch (error) {
        $("ultimoFolio").textContent =
            "No se pudo consultar el último folio. Revisa el historial antes de asignarlo.";
    }
}

function lineaServicio(titulo, descripcion, importe) {
    return `
        <div class="service-line">
            <div>
                <strong>${escapar(titulo)}</strong>
                <small>${escapar(descripcion)}</small>
            </div>
            <span class="service-amount">${escapar(dinero(importe))}</span>
        </div>
    `;
}

function generarDetalleServicio(calculo, prendasNormales, total, lavadas) {
    let html = "";

    if (calculo.kilos > 0) {
        html += lineaServicio(
            `Servicio ${calculo.servicio}`,
            `${calculo.kilos} kg × ${dinero(calculo.precioKilo)}`,
            calculo.subtotalRopa
        );
    }

    if (prendasNormales.length) {
        html += `
            <div class="clothes-detail">
                <strong>Prendas recibidas por kilo</strong>
                ${prendasNormales.map(prenda =>
                    `${escapar(prenda.nombre)}: ${prenda.cantidad}`
                ).join(" · ")}
            </div>
        `;
    }

    calculo.prendasEspeciales.forEach(prenda => {
        html += lineaServicio(
            prenda.nombre,
            `${prenda.cantidad} × ${dinero(prenda.precio)}`,
            redondear(prenda.cantidad * prenda.precio)
        );
    });

    if (calculo.tipoDomicilio) {
        html += lineaServicio(
            "Servicio a domicilio",
            calculo.tipoDomicilio,
            calculo.precioDomicilio
        );
    }

    const ajuste = redondear(total - calculo.subtotal);

    if (ajuste !== 0) {
        html += lineaServicio(
            ajuste < 0 ? "Descuento aplicado" : "Ajuste de importe",
            "Ajuste manual del total",
            ajuste
        );
    }

    if (lavadas > 0) {
        html += `
            <div class="clothes-detail">
                <strong>Lavadas acumuladas: ${lavadas}</strong>
            </div>
        `;
    }

    return html;
}

function validarFormulario() {
    const formulario = $("formRecibo");

    if (!formulario.reportValidity()) return false;

    if (!$("cliente").value.trim()) {
        avisar("Escribe el nombre del cliente.", true);
        $("cliente").focus();
        return false;
    }

    if (!$("folio").value.trim()) {
        avisar("Ingresa el folio del recibo.", true);
        $("folio").focus();
        return false;
    }

    if ($("fechaEntrega").value < $("fechaIngreso").value) {
        avisar("La fecha de entrega no puede ser anterior al ingreso.", true);
        $("fechaEntrega").focus();
        return false;
    }

    const calculo = obtenerCalculo();

    if (calculo.kilos === 0 && calculo.prendasEspeciales.length === 0) {
        avisar("Agrega kilos de ropa o al menos una prenda especial.", true);
        $("kilos").focus();
        return false;
    }

    if (calculo.kilos === 0 && obtenerPrendas(".ropa-normal").length > 0) {
        avisar("Captura el peso de las prendas que se cobran por kilo.", true);
        $("kilos").focus();
        return false;
    }

    return true;
}

function obtenerDatos() {
    const calculo = obtenerCalculo();
    const prendasNormales = obtenerPrendas(".ropa-normal");
    const total = redondear(numero($("total").value));
    const lavadas = numero($("lavadas").value);

    return {
        cliente: $("cliente").value.trim(),
        folio: $("folio").value.trim(),
        servicio: calculo.servicio,
        kilos: String(calculo.kilos),
        total: total.toFixed(2),
        estado: $("estado").value.toLowerCase(),
        metodoPago: $("metodoPago").value.toLowerCase(),
        fechaIngreso: $("fechaIngreso").value,
        fechaEntrega: $("fechaEntrega").value,
        horaEntrega: formatoHora($("horaEntrega").value),
        detalleServicio: generarDetalleServicio(
            calculo,
            prendasNormales,
            total,
            lavadas
        ),
        lavadas,
        prendasNormales,
        prendasEspeciales: calculo.prendasEspeciales,
        tipoDomicilio: calculo.tipoDomicilio,
        precioDomicilio: calculo.precioDomicilio,
        subtotalCalculado: calculo.subtotal,
        ajusteManual: redondear(total - calculo.subtotal)
    };
}

function mostrarRecibo(data) {
    $("fechaRecibo").textContent = mostrarFecha(data.fechaEmision);
    $("folioRecibo").textContent = data.folio;
    $("clienteRecibo").textContent = data.cliente;
    $("detalleServicio").innerHTML = data.detalleServicio;
    $("totalRecibo").textContent = Number(data.total).toLocaleString("es-MX", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    $("estadoRecibo").textContent =
        data.estado === "pagado" ? "Pagado" : "Pendiente";

    $("estadoRecibo").dataset.estado = data.estado;
    $("estadoRecibo").classList.toggle("pagado", data.estado === "pagado");
    $("estadoRecibo").classList.toggle("pendiente", data.estado !== "pagado");

    $("pagoRecibo").textContent =
        data.metodoPago === "transferencia" ? "Transferencia" : "Efectivo";

    $("entregaRecibo").textContent =
        `${mostrarFecha(data.fechaEntrega)} · ${data.horaEntrega}`;

    $("resultado").classList.remove("hidden");
    $("recibo").classList.remove("hidden");
    $("btnCompartir").classList.remove("hidden");

    $("resultado").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

async function generarRecibo() {
    if (guardando || compartiendo || preparandoImagen) return;

    if (!database) {
        avisar("No se pudo conectar con Firebase. Recarga la página.", true);
        return;
    }

    if (!validarFormulario()) return;

    const datos = obtenerDatos();
    const contenido = JSON.stringify(datos);

    if (contenido === ultimoContenidoGuardado) {
        avisar("Este recibo ya está guardado. Puedes compartirlo abajo.");
        $("resultado").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
        return;
    }

    if (reciboActual && datos.folio === reciboActual.folio) {
        avisar(
            "Este folio ya se guardó. Para crear otro recibo, ingresa un folio nuevo. Para modificar el anterior, entra al historial.",
            true
        );
        return;
    }

    guardando = true;
    cambiarBotonGenerar(true);
    avisar("Guardando recibo. Espera la confirmación antes de cerrar esta página.");

    try {
        if (!solicitudPendiente || solicitudPendiente.contenido !== contenido) {
            solicitudPendiente = {
                contenido,
                referencia: database.ref("recibos").push(),
                datos: {
                    ...datos,
                    fechaEmision: fechaLocal(),
                    creadoEn: Date.now()
                }
            };
        }

        await solicitudPendiente.referencia.set(solicitudPendiente.datos);

        reciboActual = solicitudPendiente.datos;
        ultimoContenidoGuardado = contenido;
        solicitudPendiente = null;
        archivoRecibo = null;

        if (/^\d+$/.test(reciboActual.folio)) {
            mayorFolioConocido = Math.max(
                mayorFolioConocido,
                Number(reciboActual.folio)
            );
            $("ultimoFolio").textContent =
                `Último folio registrado: ${mayorFolioConocido}`;
        }

        mostrarRecibo(reciboActual);
        avisar("Recibo guardado correctamente.");
        await prepararImagenRecibo();
    } catch (error) {
        avisar(
            "No se pudo confirmar el guardado. Verifica tu conexión y vuelve a intentar con los mismos datos.",
            true
        );
    } finally {
        guardando = false;
        cambiarBotonGenerar(false);
    }
}

function esperarImagen(imagen) {
    if (imagen.complete) {
        return imagen.naturalWidth > 0
            ? Promise.resolve()
            : Promise.reject(new Error("No se pudo cargar una imagen del recibo."));
    }

    return new Promise((resolve, reject) => {
        const limpiar = () => {
            clearTimeout(temporizador);
            imagen.removeEventListener("load", cargada);
            imagen.removeEventListener("error", fallida);
        };

        const cargada = () => {
            limpiar();
            resolve();
        };

        const fallida = () => {
            limpiar();
            reject(new Error("No se pudo cargar una imagen del recibo."));
        };

        const temporizador = setTimeout(fallida, 15000);

        imagen.addEventListener("load", cargada);
        imagen.addEventListener("error", fallida);
    });
}

async function crearArchivoRecibo() {
    if (typeof html2canvas !== "function") {
        throw new Error("No se cargó el generador de imágenes.");
    }

    const recibo = $("recibo");

    await Promise.all(
        [...recibo.querySelectorAll("img")].map(esperarImagen)
    );

    if (document.fonts?.ready) await document.fonts.ready;

    const canvas = await html2canvas(recibo, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        onclone: documento => {
            const copia = documento.getElementById("recibo");
            copia.style.boxShadow = "none";
            copia.style.margin = "0";
        }
    });

    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(resultado => {
            if (resultado) resolve(resultado);
            else reject(new Error("No se pudo generar la imagen."));
        }, "image/png");
    });

    const folio = reciboActual.folio.replace(/[^a-zA-Z0-9_-]/g, "") || "JC";

    return new File([blob], `Lavanderia_JC_Recibo_${folio}.png`, {
        type: "image/png"
    });
}

async function prepararImagenRecibo() {
    if (preparandoImagen) return preparandoImagen;

    cambiarBotonCompartir("Preparando imagen…", true);

    preparandoImagen = (async () => {
        try {
            archivoRecibo = await crearArchivoRecibo();
            cambiarBotonCompartir("Compartir recibo");
            return archivoRecibo;
        } catch (error) {
            archivoRecibo = null;
            cambiarBotonCompartir("Volver a preparar imagen");
            avisar(
                "El recibo está guardado, pero no se pudo preparar su imagen. Verifica tu conexión y que exista imagenes/QR.png."
            );
            return null;
        }
    })();

    try {
        return await preparandoImagen;
    } finally {
        preparandoImagen = null;
    }
}

function descargarArchivo(archivo) {
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement("a");

    enlace.href = url;
    enlace.download = archivo.name;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function compartirRecibo() {
    if (compartiendo || preparandoImagen || !reciboActual) return;

    if (!archivoRecibo) {
        const preparado = await prepararImagenRecibo();
        if (preparado) {
            avisar("Imagen lista. Toca Compartir recibo para enviarla.");
        }
        return;
    }

    compartiendo = true;
    cambiarBotonCompartir("Compartiendo…", true);

    try {
        const puedeCompartir =
            typeof navigator.share === "function" &&
            typeof navigator.canShare === "function" &&
            navigator.canShare({ files: [archivoRecibo] });

        if (puedeCompartir) {
            await navigator.share({
                files: [archivoRecibo],
                title: `Recibo ${reciboActual.folio} · Lavandería JC`,
                text: "Gracias por tu preferencia. Conserva este recibo para recoger tu ropa."
            });
        } else {
            descargarArchivo(archivoRecibo);
            avisar(
                "Se inició la descarga del recibo. Puedes adjuntar la imagen en WhatsApp."
            );
        }
    } catch (error) {
        if (error.name !== "AbortError") {
            descargarArchivo(archivoRecibo);
            avisar(
                "No se pudo abrir el menú para compartir. Se inició la descarga de la imagen."
            );
        }
    } finally {
        compartiendo = false;
        cambiarBotonCompartir("Compartir recibo");
    }
}

function iniciar() {
    const clave = window.prompt(
        "Apartado solo para administradores. Ingresa la contraseña:"
    );

    if (clave !== "costa2025") {
        if (clave !== null) window.alert("Contraseña incorrecta.");
        window.location.replace("index.html");
        return;
    }

    document.body.style.display = "flex";

    const hoy = fechaLocal();
    $("fechaIngreso").value = hoy;
    $("fechaEntrega").min = hoy;

    activarCalculoAutomatico();

    try {
        if (typeof firebase === "undefined") {
            throw new Error("Firebase no está disponible.");
        }

        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        database = firebase.database();
        mostrarUltimoFolio();
    } catch (error) {
        $("ultimoFolio").textContent = "Conexión no disponible.";
        $("btnGenerar").disabled = true;
        avisar(
            "No se pudo cargar la conexión. Revisa tu internet y recarga esta página."
        );
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar, { once: true });
} else {
    iniciar();
}
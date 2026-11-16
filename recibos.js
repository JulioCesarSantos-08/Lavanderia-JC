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
let iniciandoNuevoJC = false;

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
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(fecha);
    const valor = tipo => partes.find(p => p.type === tipo).value;
    return valor('year') + '-' + valor('month') + '-' + valor('day');
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
    const fila = (titulo, detalle) => '<div class="service-line"><div><strong>' +
        escapar(titulo) + '</strong><small>' + escapar(detalle) + '</small></div></div>';
    let html = '';

    if (calculo.kilos > 0) {
        html += fila(
            'Servicio ' + calculo.servicio,
            new Intl.NumberFormat('es-MX', {
                maximumFractionDigits: 3
            }).format(calculo.kilos) + ' kg de ropa'
        );
    }

    if (prendasNormales.length) {
        html += fila(
            'Prendas recibidas',
            prendasNormales.map(p => p.nombre + ': ' + p.cantidad).join(' \u00b7 ')
        );
    }

    calculo.prendasEspeciales.forEach(p => {
        html += fila(p.nombre, 'Cantidad: ' + p.cantidad);
    });

    if (calculo.tipoDomicilio) {
        html += fila('Servicio a domicilio', calculo.tipoDomicilio);
    }

    if (lavadas > 0) {
        html += fila('Lavadas acumuladas', String(lavadas));
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
    aplicarTemporadaJC(data.fechaEmision);
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
    if (guardando || compartiendo || preparandoImagen || iniciandoNuevoJC) return;

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
        width: 440,
        windowWidth: 480,
        scrollX: 0,
        scrollY: 0,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        onclone: documento => {
            const copia = documento.getElementById("recibo");
            copia.style.boxShadow = "none";
            copia.style.margin = "0";
            copia.style.width = "440px";
            copia.style.maxWidth = "none";
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
    let accesoRecordado = false;

    try {
        accesoRecordado = sessionStorage.getItem('jc-acceso-recibos') === 'activo';
    } catch {}

    if (!accesoRecordado) {
    const clave = window.prompt(
        "Apartado solo para administradores. Ingresa la contraseña:"
    );

    if (clave !== "costa2025") {
        if (clave !== null) window.alert("Contraseña incorrecta.");
        window.location.replace("index.html");
        return;
    }


        try {
            sessionStorage.setItem('jc-acceso-recibos', 'activo');
        } catch {}
    }

    $('btnNuevoRecibo').addEventListener('click', nuevoReciboJC);

    $('btnCerrarSesionJC').addEventListener('click', () => {
        if (guardando || compartiendo || preparandoImagen || iniciandoNuevoJC) return;
        if (!confirm('Cerrar sesion? Se perdera la captura que no hayas guardado.')) return;

        try {
            sessionStorage.removeItem('jc-acceso-recibos');
        } catch {}

        window.location.replace('index.html');
    });

    document.body.style.display = "flex";
    document.body.dataset.recibosVersion = "jc6-1794800768491";

    let versionJC = document.getElementById('versionRecibosJC');

    if (!versionJC) {
        versionJC = document.createElement('p');
        versionJC.id = 'versionRecibosJC';
        versionJC.style.cssText = 'margin:12px;padding:12px;background:#073e49;color:white;text-align:center;border-radius:10px;font:700 13px Arial';
        document.body.prepend(versionJC);
    }

    versionJC.textContent = 'Recibos V6 | ' + fechaLocal() + ' | ' + temporadaJC(fechaLocal()).titulo;


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
function temporadaJC(fecha) {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const md = mes * 100 + dia;

    if (md >= 1110 && md <= 1120 && anio > 2024) {
        return {
            tema: 'aniversario',
            titulo: (anio - 2024) + ' A\u00d1OS CONTIGO',
            mensaje: 'Gracias por ser parte de nuestra historia.'
        };
    }

    if (md >= 1205 && md <= 1228) {
        return {
            tema: 'navidad',
            titulo: 'FELIZ NAVIDAD',
            mensaje: 'Que la alegria llegue a cada rincon de tu hogar.'
        };
    }

    if (md >= 1229 || md <= 105) {
        return {
            tema: 'nuevo',
            titulo: '\u00a1FELIZ ' + (mes === 12 ? anio + 1 : anio) + '!',
            mensaje: 'Un nuevo a\u00f1o para seguir cuidando de ti.'
        };
    }

    if (md >= 508 && md <= 512) {
        return {
            tema: 'madres',
            titulo: 'CON CARI\u00d1O PARA MAM\u00c1',
            mensaje: 'Celebramos el amor que cuida cada detalle.'
        };
    }

    return {
        tema: 'habitual',
        titulo: 'CUIDAMOS LO QUE VISTES',
        mensaje: 'Limpieza que se siente.'
    };
}

function aplicarTemporadaJC(fecha) {
    const temporada = temporadaJC(fecha);
    const tema = temporada.tema;
    const anio = Number(fecha.slice(0, 4));
    const mes = Number(fecha.slice(5, 7));
    const recibo = $('recibo');

    recibo.dataset.temporada = tema;

    let banda = $('temporadaReciboJC');

    if (!banda) {
        banda = document.createElement('div');
        banda.id = 'temporadaReciboJC';
        recibo.querySelector('.receipt-header').appendChild(banda);
    }

    banda.replaceChildren();

    const mensajes = {
        aniversario: [
            'EDICI\u00d3N DE ANIVERSARIO',
            String(anio - 2024),
            'A\u00d1OS CONTIGO',
            'Tu confianza es nuestro mejor regalo.',
            'Gracias por celebrar con nosotros'
        ],
        navidad: [
            'UN DETALLE LLENO DE CARI\u00d1O',
            'NAVIDAD',
            'QUE SE SIENTE EN CASA',
            'Te deseamos paz, amor y momentos felices.',
            'Felices fiestas, de nuestra familia a la tuya'
        ],
        nuevo: [
            'BRINDEMOS POR LO QUE VIENE',
            String(mes === 12 ? anio + 1 : anio),
            '\u00a1FELIZ A\u00d1O NUEVO!',
            'Gracias por acompa\u00f1arnos un a\u00f1o m\u00e1s.',
            'Un nuevo comienzo, la misma dedicaci\u00f3n'
        ],
        madres: [
            'HOY CELEBRAMOS TU AMOR',
            'MAM\u00c1',
            'GRACIAS POR TANTO',
            'Para quien cuida de todos, todo nuestro cari\u00f1o.',
            'Con mucho cari\u00f1o, Lavander\u00eda JC'
        ]
    };

    const gracias = recibo.querySelector('.gracias');

    if (gracias) {
        gracias.textContent = tema === 'habitual'
            ? 'Gracias por tu preferencia'
            : mensajes[tema][4];
    }

    if (tema === 'habitual') {
        banda.className = '';

        const titulo = document.createElement('strong');
        titulo.textContent = temporada.titulo;

        const mensaje = document.createElement('span');
        mensaje.textContent = temporada.mensaje;

        banda.append(titulo, mensaje);
        return;
    }

    banda.className = 'fiesta-jc';

    const estrella = (x, y, color, escala = 1) =>
        '<path transform="translate(' + x + ' ' + y + ') scale(' + escala +
        ')" d="M0 -8 2 -2 8 0 2 2 0 8 -2 2 -8 0 -2 -2Z" fill="' + color + '"/>';

    const globo = (x, y, color, giro) =>
        '<g transform="translate(' + x + ' ' + y + ') rotate(' + giro + ')">' +
        '<path d="M0 29C-18 57 20 69 0 99" fill="none" stroke="#e5c47a" stroke-width="1.5"/>' +
        '<ellipse rx="22" ry="29" fill="' + color + '"/>' +
        '<path d="M-10 -17Q-18 -8 -16 1" fill="none" stroke="#fff" stroke-opacity=".65" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M0 27-4 34H4Z" fill="' + color + '"/></g>';

    const flor = (x, y, escala, color) => {
        let petalos = '';

        for (let i = 0; i < 6; i++) {
            petalos += '<ellipse cy="-12" rx="8" ry="13" fill="' + color +
                '" transform="rotate(' + i * 60 + ')"/>';
        }

        return '<g transform="translate(' + x + ' ' + y + ') scale(' + escala + ')">' +
            petalos + '<circle r="6" fill="#efbd58"/></g>';
    };

    const fuego = (x, y, color, radio) => {
        let lineas = '';

        for (let i = 0; i < 12; i++) {
            const a = i * Math.PI / 6;

            lineas += '<path d="M' +
                (x + Math.cos(a) * 12) + ' ' +
                (y + Math.sin(a) * 12) + 'L' +
                (x + Math.cos(a) * radio) + ' ' +
                (y + Math.sin(a) * radio) +
                '" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>';

            lineas += '<circle cx="' +
                (x + Math.cos(a) * (radio + 7)) +
                '" cy="' + (y + Math.sin(a) * (radio + 7)) +
                '" r="1.8" fill="' + color + '"/>';
        }

        return lineas;
    };

    let dibujo = '';

    if (tema === 'aniversario') {
        dibujo =
            globo(24, 71, '#d7a640', -15) +
            globo(63, 35, '#40b9d2', 13) +
            globo(418, 72, '#40b9d2', 14) +
            globo(379, 36, '#efca70', -13);

        [[18,178],[85,123],[357,133],[421,186],[108,28],[331,28]]
            .forEach(([x,y]) => {
                dibujo += estrella(x,y,'#efca70',.65);
            });

        [[13,20],[78,174],[355,190],[431,28],[104,77],[338,81]]
            .forEach(([x,y],i) => {
                dibujo += '<rect x="' + x + '" y="' + y +
                    '" width="4" height="10" rx="1" fill="' +
                    (i % 2 ? '#61d4de' : '#edc15e') +
                    '" transform="rotate(25 ' + x + ' ' + y + ')"/>';
            });
    }

    if (tema === 'navidad') {
        dibujo = '<g stroke="#69a976" stroke-width="3">' +
            '<path d="M0 0 87 51M440 0 353 51"/>';

        for (let i = 0; i < 6; i++) {
            const x = i * 12;

            dibujo += '<path d="M' + x + ' ' + (i * 7) +
                'l2 22m0 -22 23 -5M' + (440 - x) + ' ' + (i * 7) +
                'l-2 22m0 -22 -23 -5"/>';
        }

        dibujo += '</g>' +
            '<g stroke="#e6c574" stroke-width="1.5">' +
            '<path d="M38 0v56M77 0v30M402 0v56M363 0v30"/></g>' +
            '<g fill="#df4c4c" stroke="#ffb6a1" stroke-width="2">' +
            '<circle cx="38" cy="69" r="15"/>' +
            '<circle cx="402" cy="69" r="15"/></g>' +
            '<g fill="#f1cf7b">' +
            '<circle cx="77" cy="40" r="10"/>' +
            '<circle cx="363" cy="40" r="10"/></g>';

        [24,416].forEach(x => {
            dibujo += '<path d="M' + x +
                ' 140l-20 28h12l-18 25h52l-18 -25h12Z" fill="#70ab7c"/>' +
                '<rect x="' + (x - 3) +
                '" y="193" width="6" height="10" fill="#d9b46b"/>';

            dibujo += estrella(x,136,'#f6d58c',.65);
        });

        [[18,111],[81,143],[360,146],[421,110]].forEach(([x,y]) => {
            dibujo += estrella(x,y,'#ffffff',.5);
        });
    }

    if (tema === 'nuevo') {
        dibujo =
            fuego(39,61,'#efca70',30) +
            fuego(402,56,'#c3b4ff',30) +
            fuego(25,184,'#b2a2ee',22) +
            fuego(418,183,'#efca70',23);

        [[93,30],[347,27],[84,135],[359,134],[118,200],[321,204]]
            .forEach(([x,y]) => {
                dibujo += estrella(x,y,'#efca70',.6);
            });
    }

    if (tema === 'madres') {
        dibujo = '<g fill="none" stroke="#52795c" stroke-width="3">' +
            '<path d="M0 210Q70 175 27 24M440 210Q370 175 413 24"/></g>' +
            '<g fill="#6b9974">' +
            '<ellipse cx="22" cy="119" rx="10" ry="23" transform="rotate(-35 22 119)"/>' +
            '<ellipse cx="48" cy="151" rx="9" ry="22" transform="rotate(35 48 151)"/>' +
            '<ellipse cx="418" cy="119" rx="10" ry="23" transform="rotate(35 418 119)"/>' +
            '<ellipse cx="392" cy="151" rx="9" ry="22" transform="rotate(-35 392 151)"/></g>';

        dibujo +=
            flor(20,48,1.2,'#da7594') +
            flor(54,88,.8,'#f3b5c5') +
            flor(17,180,.85,'#e896ad') +
            flor(420,48,1.2,'#da7594') +
            flor(386,88,.8,'#f3b5c5') +
            flor(423,180,.85,'#e896ad');
    }

    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="440" height="230" viewBox="0 0 440 230">' +
        dibujo + '</svg>';

    const imagen = document.createElement('img');
    imagen.className = 'fiesta-jc-arte';
    imagen.alt = '';
    imagen.setAttribute('aria-hidden', 'true');
    imagen.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

    const contenido = document.createElement('div');
    contenido.className = 'fiesta-jc-contenido';

    const clases = [
        'fiesta-jc-etiqueta',
        'fiesta-jc-grande',
        'fiesta-jc-titulo',
        'fiesta-jc-mensaje'
    ];

    mensajes[tema].slice(0,4).forEach((texto,i) => {
        const elemento = document.createElement(i === 1 ? 'strong' : 'span');
        elemento.className = clases[i];
        elemento.textContent = texto;
        contenido.appendChild(elemento);
    });

    banda.append(imagen, contenido);
}

async function nuevoReciboJC() {
    if (guardando || compartiendo || preparandoImagen || iniciandoNuevoJC) {
        avisar('Espera a que termine el guardado o la preparacion de la imagen.');
        return;
    }

    if (solicitudPendiente) {
        avisar(
            'Hay un guardado sin confirmar. Reintenta Generar recibo con los mismos datos antes de iniciar otro.',
            true
        );
        return;
    }

    const sinGuardar = !reciboActual ||
        JSON.stringify(obtenerDatos()) !== ultimoContenidoGuardado;

    if (sinGuardar && !confirm(
        'Limpiar la captura para iniciar un nuevo recibo? Los cambios sin guardar se perderan.'
    )) return;

    iniciandoNuevoJC = true;
    $('btnNuevoRecibo').disabled = true;

    try {
        $('formRecibo').reset();
        $('fechaIngreso').value = fechaLocal();
        $('fechaEntrega').min = $('fechaIngreso').value;

        totalModificadoManualmente = false;
        archivoRecibo = null;
        reciboActual = null;
        ultimoContenidoGuardado = '';

        $('resultado').classList.add('hidden');
        $('recibo').classList.add('hidden');
        $('btnCompartir').classList.add('hidden');

        sincronizarDomicilio();
        calcularTotal();

        $('folio').value = mayorFolioConocido + 1;
        avisar('Nueva captura lista. Consultando el siguiente folio...');

        if (database) await mostrarUltimoFolio();

        avisar('Nueva captura lista. Revisa el folio indicado y agrega al siguiente cliente.');
        $('cliente').focus();

        $('formRecibo').scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    } finally {
        iniciandoNuevoJC = false;
        $('btnNuevoRecibo').disabled = false;
    }
}

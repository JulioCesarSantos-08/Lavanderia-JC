const firebaseConfig = {
    apiKey: "AIzaSyCwBZMUnQ6rH3APMo4kXDiDvg_u7Zsud9w",
    authDomain: "lavanderia-nueva.firebaseapp.com",
    databaseURL: "https://lavanderia-nueva-default-rtdb.firebaseio.com",
    projectId: "lavanderia-nueva",
    storageBucket: "lavanderia-nueva.appspot.com",
    messagingSenderId: "1074532951",
    appId: "1:1074532951:web:311703f9f5441d11240912"
};

const $ = id => document.getElementById(id);

const moneda = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN"
});

const categorias = {
    insumos: "Insumos",
    gastos: "Gastos generales",
    otros: "Otros"
};

const estado = {
    db: null,
    registros: [],
    periodo: [],
    desde: "",
    hasta: "",
    vista: "todos",
    grafica: "movimientos",
    limite: 20,
    cargando: false,
    ocupado: false,
    cargado: false,
    detalle: null,
    edicion: null,
    gasto: null,
    confirmacion: null,
    chart: null,
    chartPago: null,
    timerToast: null
};

function escapar(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[caracter]);
}

function numero(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
}

function centavos(valor) {
    return Math.round(numero(valor) * 100);
}

function dinero(valor) {
    return moneda.format(numero(valor));
}

function textoPlano(html) {
    const documento = new DOMParser().parseFromString(
        String(html ?? ""),
        "text/html"
    );

    documento.querySelectorAll(
        "script, style, iframe, object, embed"
    ).forEach(elemento => elemento.remove());

    documento.querySelectorAll("br").forEach(elemento => {
        elemento.replaceWith(documento.createTextNode("\n"));
    });

    documento.querySelectorAll(
        "div, p, li, section, article"
    ).forEach(elemento => {
        elemento.appendChild(documento.createTextNode("\n"));
    });

    return (documento.body.textContent || "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function normalizar(valor) {
    return String(valor ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function fechaLocal(fecha = new Date()) {
    return [
        fecha.getFullYear(),
        String(fecha.getMonth() + 1).padStart(2, "0"),
        String(fecha.getDate()).padStart(2, "0")
    ].join("-");
}

function fechaValida(valor) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor || "")) return false;
    const [anio, mes, dia] = valor.split("-").map(Number);
    const fecha = new Date(anio, mes - 1, dia);
    return fecha.getFullYear() === anio &&
        fecha.getMonth() === mes - 1 &&
        fecha.getDate() === dia;
}

function fechaTexto(valor, corta = false) {
    if (!fechaValida(valor)) return "Sin fecha";
    const [anio, mes, dia] = valor.split("-").map(Number);
    return new Date(anio, mes - 1, dia).toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        ...(corta ? {} : { year: "numeric" })
    });
}

function horaInput(valor) {
    const texto = String(valor || "").trim();
    const coincidencia = texto.match(
        /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i
    );

    if (!coincidencia) return "";

    let hora = Number(coincidencia[1]);
    const minutos = Number(coincidencia[2]);
    const periodo = coincidencia[3]?.toUpperCase();

    if (minutos > 59) return "";

    if (periodo) {
        if (hora < 1 || hora > 12) return "";
        hora = hora % 12 + (periodo === "PM" ? 12 : 0);
    }

    if (hora > 23) return "";
    return `${String(hora).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
}

function horaTexto(valor) {
    if (!valor) return "";
    const [hora, minutos] = valor.split(":");
    const h = Number(hora);
    return `${h % 12 || 12}:${minutos} ${h >= 12 ? "PM" : "AM"}`;
}

function esPagado(registro) {
    return normalizar(registro.data.estado) === "pagado";
}

function nombreEstado(valor) {
    const nombre = normalizar(valor);

    if (nombre === "pagado") return "Pagado";
    if (!nombre || nombre === "pendiente") return "Pendiente";
    if (nombre === "pedido listo") return "Pedido listo";

    return String(valor);
}

function metodoTexto(valor) {
    const metodo = normalizar(valor);
    if (metodo === "efectivo") return "Efectivo";
    if (metodo === "transferencia") return "Transferencia";
    return valor ? String(valor) : "Sin especificar";
}

function mensaje(texto = "") {
    $("mensajePanel").textContent = texto;
}

function notificar(texto, error = false) {
    clearTimeout(estado.timerToast);
    $("notificacion").textContent = texto;
    $("notificacion").classList.toggle("error", error);
    $("notificacion").hidden = false;

    estado.timerToast = setTimeout(() => {
        $("notificacion").hidden = true;
    }, 4500);
}

function errorFormulario(id, error) {
    $(id).textContent = error.message || "No se pudo completar la acción.";
}

function abrirModal(id) {
    const dialogo = $(id);
    if (!dialogo.open) dialogo.showModal();
    document.body.classList.add("modal-open");
}

function cerrarModal(id) {
    if (estado.ocupado) return;
    if ($(id).open) $(id).close();
}

function establecerOcupado(valor) {
    estado.ocupado = valor;

    document.querySelectorAll(
        "dialog[open] button, dialog[open] input, dialog[open] select"
    ).forEach(elemento => {
        elemento.disabled = valor;
    });
}

function crearRegistro(tipo, id, data) {
    return {
        tipo,
        id,
        ruta: `${tipo === "recibo" ? "recibos" : "gastos"}/${id}`,
        data,
        fecha: tipo === "recibo" ? data.fechaEntrega || "" : data.fecha || "",
        monto: numero(tipo === "recibo" ? data.total : data.monto)
    };
}

function guardarLocal(registro, data) {
    const actualizado = crearRegistro(registro.tipo, registro.id, data);
    const indice = estado.registros.findIndex(r => r.ruta === registro.ruta);

    if (indice >= 0) estado.registros[indice] = actualizado;
    else estado.registros.push(actualizado);

    actualizarPanel();
    return actualizado;
}

function eliminarLocal(rutas) {
    const conjunto = new Set(rutas);
    estado.registros = estado.registros.filter(r => !conjunto.has(r.ruta));
    actualizarPanel();
}

async function cargarDatos() {
    if (estado.cargando || estado.ocupado || !estado.db) return;

    estado.cargando = true;
    $("btnActualizar").disabled = true;
    $("estadoCarga").hidden = false;
    $("lista-recibos").setAttribute("aria-busy", "true");
    $("textoConexion").textContent = "Actualizando…";
    mensaje();

    try {
        const [recibos, gastos] = await Promise.all([
            estado.db.ref("recibos").once("value"),
            estado.db.ref("gastos").once("value")
        ]);

        const registros = [];

        recibos.forEach(child => {
            const data = child.val();
            if (data && typeof data === "object") {
                registros.push(crearRegistro("recibo", child.key, data));
            }
        });

        gastos.forEach(child => {
            const data = child.val();
            if (data && typeof data === "object") {
                registros.push(crearRegistro("gasto", child.key, data));
            }
        });

        estado.registros = registros;
        estado.cargado = true;
        $("estadoConexion").classList.remove("error", "offline");
        $("textoConexion").textContent = "Datos actualizados";
        actualizarPanel();
    } catch (error) {
        $("estadoConexion").classList.add("error");
        $("textoConexion").textContent = "No se pudo actualizar";
        mensaje(
            estado.cargado
                ? "Se conservan los datos cargados anteriormente. Revisa tu conexión y vuelve a actualizar."
                : "No se pudieron cargar los registros. Revisa tu conexión y los permisos de Firebase."
        );
    } finally {
        estado.cargando = false;
        $("btnActualizar").disabled = false;
        $("estadoCarga").hidden = true;
        $("lista-recibos").setAttribute("aria-busy", "false");
    }
}

function dentroDelPeriodo(registro) {
    if (!estado.desde && !estado.hasta) return true;
    if (!fechaValida(registro.fecha)) return false;

    return (!estado.desde || registro.fecha >= estado.desde) &&
        (!estado.hasta || registro.fecha <= estado.hasta);
}

function etiquetaPeriodo() {
    if (!estado.desde && !estado.hasta) return "Todo el historial";
    if (estado.desde === estado.hasta) return fechaTexto(estado.desde);
    if (!estado.desde) return `Hasta ${fechaTexto(estado.hasta)}`;
    if (!estado.hasta) return `Desde ${fechaTexto(estado.desde)}`;
    return `${fechaTexto(estado.desde)} — ${fechaTexto(estado.hasta)}`;
}

function aplicarFiltros() {
    const desde = $("filtroDesde").value;
    const hasta = $("filtroHasta").value;

    if (desde && hasta && desde > hasta) {
        mensaje("La fecha inicial no puede ser posterior a la fecha final.");
        return;
    }

    estado.desde = desde;
    estado.hasta = hasta;
    estado.limite = 20;
    mensaje();
    actualizarPanel();
}

function seleccionarPeriodo(tipo) {
    const hoy = new Date();
    const inicio = new Date(hoy);
    let desde = "";
    let hasta = "";

    if (tipo !== "todos") {
        hasta = fechaLocal(hoy);

        if (tipo === "semana") inicio.setDate(inicio.getDate() - 6);
        if (tipo === "mes") inicio.setDate(1);

        desde = fechaLocal(inicio);
    }

    $("filtroDesde").value = desde;
    $("filtroHasta").value = hasta;

    document.querySelectorAll("[data-periodo]").forEach(boton => {
        boton.setAttribute("aria-pressed", String(boton.dataset.periodo === tipo));
    });

    aplicarFiltros();
}

function actualizarPanel() {
    estado.periodo = estado.registros.filter(dentroDelPeriodo);
    actualizarResumen();
    dibujarGraficas();
    renderizarLista();
}

function actualizarResumen() {
    const recibos = estado.periodo.filter(r => r.tipo === "recibo");
    const pagados = recibos.filter(esPagado);
    const pendientes = recibos.filter(r => !esPagado(r));
    const gastos = estado.periodo.filter(r => r.tipo === "gasto");

    const suma = registros => registros.reduce(
        (total, r) => total + centavos(r.monto), 0
    ) / 100;

    const ingresos = suma(pagados);
    const egresos = suma(gastos);
    const balance = ingresos - egresos;

    $("total-ganancias").textContent = dinero(balance);
    document.querySelector(".balance-card").classList.toggle("negative", balance < 0);
    $("totalIngresos").textContent = dinero(ingresos);
    $("totalGastos").textContent = dinero(egresos);
    $("totalPendientes").textContent = dinero(suma(pendientes));
    $("cantidadRecibos").textContent = recibos.length;
    $("cantidadPagados").textContent = `${pagados.length} recibos pagados`;
    $("cantidadGastos").textContent = `${gastos.length} gastos registrados`;
    $("cantidadPendientes").textContent = `${pendientes.length} sin pago confirmado`;
    $("periodoResumen").textContent = etiquetaPeriodo();

    const sinFecha = estado.periodo.filter(r => !fechaValida(r.fecha)).length;

    if (sinFecha) {
        mensaje(
            `${sinFecha} registros no tienen una fecha válida. Se incluyen en el resumen de todo el historial, pero no en la gráfica por fecha.`
        );
    }
}

function datosPorFecha() {
    const dias = new Map();

    estado.periodo.forEach(r => {
        if (!fechaValida(r.fecha)) return;
        if (r.tipo === "recibo" && !esPagado(r)) return;

        if (!dias.has(r.fecha)) {
            dias.set(r.fecha, { ingresos: 0, gastos: 0 });
        }

        const dia = dias.get(r.fecha);
        if (r.tipo === "gasto") dia.gastos += centavos(r.monto);
        else dia.ingresos += centavos(r.monto);
    });

    return [...dias.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([fecha, valores]) => ({
            fecha,
            ingresos: valores.ingresos / 100,
            gastos: valores.gastos / 100,
            balance: (valores.ingresos - valores.gastos) / 100
        }));
}

function dibujarGraficas() {
    const dias = datosPorFecha();

    $("tablaGrafica").innerHTML = dias.length
        ? dias.map(dia => `
            <tr>
                <td>${escapar(fechaTexto(dia.fecha))}</td>
                <td>${escapar(dinero(dia.ingresos))}</td>
                <td>${escapar(dinero(dia.gastos))}</td>
                <td class="${dia.balance < 0 ? "negative" : "positive"}">${escapar(dinero(dia.balance))}</td>
            </tr>
        `).join("")
        : '<tr><td colspan="4">Sin movimientos con fecha válida.</td></tr>';

    let series = dias;
    const mensual = dias.length > 45;

    if (mensual) {
        const meses = new Map();

        dias.forEach(dia => {
            const mes = dia.fecha.slice(0, 7);
            if (!meses.has(mes)) {
                meses.set(mes, { fecha: mes, ingresos: 0, gastos: 0 });
            }
            const item = meses.get(mes);
            item.ingresos += centavos(dia.ingresos);
            item.gastos += centavos(dia.gastos);
        });

        series = [...meses.values()].map(mes => ({
            fecha: mes.fecha,
            ingresos: mes.ingresos / 100,
            gastos: mes.gastos / 100,
            balance: (mes.ingresos - mes.gastos) / 100
        }));
    }

    $("notaGrafica").textContent = mensual
        ? "Agrupado por mes para facilitar la lectura. La tabla conserva las cifras por día."
        : "Toca una barra para consultar su importe.";

    $("graficaVacia").hidden = dias.length > 0;

    const pagos = { efectivo: 0, transferencia: 0, otros: 0 };

    estado.periodo.filter(r => r.tipo === "recibo" && esPagado(r)).forEach(r => {
        const metodo = normalizar(r.data.metodoPago);
        const clave = ["efectivo", "transferencia"].includes(metodo) ? metodo : "otros";
        pagos[clave] += centavos(r.monto);
    });

    $("totalEfectivo").textContent = dinero(pagos.efectivo / 100);
    $("totalTransferencia").textContent = dinero(pagos.transferencia / 100);
    $("totalOtroMetodo").textContent = dinero(pagos.otros / 100);

    if (typeof Chart === "undefined") {
        $("notaGrafica").textContent = "No se cargó la gráfica. Puedes consultar las cifras en la tabla.";
        return;
    }

    estado.chart?.destroy();
    estado.chartPago?.destroy();

    const comparacion = estado.grafica === "movimientos";

    $("tituloGrafica").textContent = comparacion
        ? "Ingresos y gastos"
        : "Balance del periodo";

    const etiquetas = series.map(item => mensual
        ? item.fecha
        : fechaTexto(item.fecha, true)
    );

    const datasets = comparacion
        ? [
            {
                label: "Ingresos pagados",
                data: series.map(d => d.ingresos),
                backgroundColor: "#24a38d",
                borderRadius: 5,
                maxBarThickness: 22
            },
            {
                label: "Gastos",
                data: series.map(d => d.gastos),
                backgroundColor: "#dc907e",
                borderRadius: 5,
                maxBarThickness: 22
            }
        ]
        : [{
            label: "Balance",
            data: series.map(d => d.balance),
            backgroundColor: series.map(d => d.balance < 0 ? "#cf7d88" : "#278fa3"),
            borderRadius: 5,
            maxBarThickness: 28
        }];

    estado.chart = new Chart($("graficaGanancias"), {
        type: "bar",
        data: { labels: etiquetas, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    display: comparacion,
                    position: "bottom",
                    labels: {
                        usePointStyle: true,
                        boxWidth: 7,
                        padding: 15,
                        color: "#718497",
                        font: { size: 10 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: contexto => `${contexto.dataset.label}: ${dinero(contexto.parsed.y)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        maxTicksLimit: 6,
                        maxRotation: 0,
                        color: "#8397a8",
                        font: { size: 9 }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: "#edf2f6" },
                    border: { display: false },
                    ticks: {
                        maxTicksLimit: 5,
                        color: "#8397a8",
                        font: { size: 9 },
                        callback: valor => new Intl.NumberFormat("es-MX", {
                            notation: "compact",
                            maximumFractionDigits: 1
                        }).format(valor)
                    }
                }
            }
        }
    });

    const valores = Object.values(pagos).map(n => n / 100);
    const hayPagos = valores.some(n => n > 0);

    estado.chartPago = new Chart($("graficaTipoPago"), {
        type: "doughnut",
        data: {
            labels: hayPagos
                ? ["Efectivo", "Transferencia", "Sin especificar"]
                : ["Sin ingresos"],
            datasets: [{
                data: hayPagos ? valores : [1],
                backgroundColor: hayPagos
                    ? ["#24a38d", "#508dd0", "#b9c6d2"]
                    : ["#e8eef3"],
                borderWidth: 3,
                borderColor: "#ffffff",
                hoverOffset: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "76%",
            animation: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: hayPagos,
                    callbacks: {
                        label: contexto => `${contexto.label}: ${dinero(contexto.parsed)}`
                    }
                }
            }
        }
    });
}

function registrosVisibles() {
    const busqueda = normalizar($("buscarMovimiento").value);

    const registros = estado.periodo.filter(r => {
        if (estado.vista === "recibos" && r.tipo !== "recibo") return false;
        if (estado.vista === "gastos" && r.tipo !== "gasto") return false;
        if (estado.vista === "pendientes" && (r.tipo !== "recibo" || esPagado(r))) return false;

        const texto = normalizar([
            r.data.cliente,
            r.data.folio,
            r.data.descripcion,
            r.data.servicio,
            categorias[r.data.categoria] || r.data.categoria
        ].filter(Boolean).join(" "));

        return !busqueda || texto.includes(busqueda);
    });

    const orden = $("ordenMovimientos").value;

    registros.sort((a, b) => {
        if (orden === "mayor") return b.monto - a.monto;
        if (orden === "menor") return a.monto - b.monto;

        const fecha = a.fecha.localeCompare(b.fecha);
        const desempate = numero(a.data.folio) - numero(b.data.folio);
        return orden === "antiguos"
            ? fecha || desempate
            : -fecha || -desempate;
    });

    return registros;
}

function badgeRegistro(r) {
    if (r.tipo === "gasto") {
        return '<span class="status-badge expense">Gasto</span>';
    }

    const actual = normalizar(r.data.estado);
    const clase = esPagado(r)
        ? "paid"
        : actual && actual !== "pendiente" ? "legacy" : "pending";

    return `<span class="status-badge ${clase}">${escapar(nombreEstado(r.data.estado))}</span>`;
}

function renderizarLista() {
    if (!estado.cargado) return;

    const registros = registrosVisibles();
    const visibles = registros.slice(0, estado.limite);

    $("cantidadMovimientos").textContent = registros.length;
    $("resumenLista").textContent = `${visibles.length} de ${registros.length} movimientos`;
    $("estadoVacio").hidden = registros.length > 0;
    $("btnCargarMas").hidden = visibles.length >= registros.length;

    $("lista-recibos").innerHTML = visibles.map(r => {
        const gasto = r.tipo === "gasto";
        const titulo = gasto
            ? r.data.descripcion || "Gasto sin descripción"
            : r.data.cliente || "Cliente sin nombre";
        const descripcion = gasto
            ? categorias[r.data.categoria] || r.data.categoria || "Sin categoría"
            : `${r.data.servicio || "Servicio"} · ${numero(r.data.kilos)} kg`;

        return `
            <article class="movement-card ${gasto ? "expense" : ""}">
                <div class="movement-top">
                    <span class="movement-folio">${gasto ? "SALIDA REGISTRADA" : `RECIBO #${escapar(r.data.folio || "—")}`}</span>
                    ${badgeRegistro(r)}
                </div>
                <h3>${escapar(titulo)}</h3>
                <p class="movement-description">${escapar(descripcion)}</p>
                <div class="movement-main">
                    <strong class="movement-amount">${gasto ? "− " : ""}${escapar(dinero(r.monto))}</strong>
                    ${gasto ? "" : `<span class="payment-tag">${escapar(metodoTexto(r.data.metodoPago))}</span>`}
                </div>
                <div class="movement-bottom">
                    <span class="movement-date">${gasto ? "Gasto" : "Entrega"} · ${escapar(fechaTexto(r.fecha))}</span>
                    <button type="button" data-detalle="${escapar(r.ruta)}" aria-label="Ver detalle de ${escapar(titulo)}">Ver detalle ↗</button>
                </div>
            </article>
        `;
    }).join("");
}

function campoDetalle(titulo, valor) {
    return `
        <div>
            <span class="detail-label">${escapar(titulo)}</span>
            <strong>${escapar(valor || "Sin especificar")}</strong>
        </div>
    `;
}

function abrirDetalle(ruta) {
    const r = estado.registros.find(item => item.ruta === ruta);
    if (!r) return;

    estado.detalle = r;
    const gasto = r.tipo === "gasto";

    $("tipoDetalle").textContent = gasto ? "GASTO REGISTRADO" : "RECIBO GUARDADO";
    $("tituloDetalle").textContent = gasto ? "Detalle del gasto" : `Recibo #${r.data.folio || "—"}`;

    const titulo = gasto ? r.data.descripcion : r.data.cliente;

    $("contenidoDetalle").innerHTML = `
        <div class="detail-hero">
            ${badgeRegistro(r)}
            <h3>${escapar(titulo || "Sin descripción")}</h3>
            <strong class="detail-amount">${escapar(dinero(r.monto))}</strong>
        </div>
        <div class="detail-grid">
            ${gasto
                ? campoDetalle("FECHA", fechaTexto(r.fecha)) +
                  campoDetalle("CATEGORÍA", categorias[r.data.categoria] || r.data.categoria)
                : campoDetalle("INGRESO", fechaTexto(r.data.fechaIngreso)) +
                  campoDetalle("ENTREGA", fechaTexto(r.data.fechaEntrega)) +
                  campoDetalle("HORA", r.data.horaEntrega) +
                  campoDetalle("MÉTODO DE PAGO", metodoTexto(r.data.metodoPago)) +
                  campoDetalle("SERVICIO", r.data.servicio) +
                  campoDetalle("PESO", `${numero(r.data.kilos)} kg`) +
                  campoDetalle("LAVADAS ACUMULADAS", String(numero(r.data.lavadas)))
            }
        </div>
        ${gasto ? "" : `
            <section class="detail-section">
                <h3>Detalle del servicio</h3>
                <div class="detail-content">${escapar(textoPlano(r.data.detalleServicio || r.data.ropaEntregada || "Sin detalle registrado."))}</div>
            </section>
        `}
        ${r.data.ajusteHistorial != null ? `
            <p class="detail-note">Ajuste acumulado desde el historial: ${escapar(dinero(r.data.ajusteHistorial))}. El importe actual es ${escapar(dinero(r.monto))}.</p>
        ` : ""}
        ${normalizar(r.data.estado) === "pedido listo" ? `
            <p class="detail-note">“Pedido listo” es un estado anterior y no confirma el pago. Este recibo no suma a los ingresos pagados.</p>
        ` : ""}
    `;

    $("accionesDetalle").innerHTML = `
        <button type="button" class="button button-secondary" data-accion="editar">Editar</button>
        ${gasto ? "" : `
            <button type="button" class="button button-success" data-accion="pago">${esPagado(r) ? "Marcar pendiente" : "Marcar pagado"}</button>
        `}
        <button type="button" class="button button-danger-outline" data-accion="eliminar">Eliminar</button>
    `;

    abrirModal("modalDetalle");
}

function agregarOpcionActual(select, valor, etiqueta) {
    select.querySelectorAll("[data-temporal]").forEach(opcion => opcion.remove());

    if (![...select.options].some(opcion => opcion.value === valor)) {
        const opcion = new Option(etiqueta || valor, valor);
        opcion.dataset.temporal = "true";
        select.add(opcion);
    }

    select.value = valor;
}

function abrirEdicionRecibo(r) {
    cerrarModal("modalDetalle");
    estado.edicion = r;

    $("folioEdicion").textContent = `Folio #${r.data.folio || "—"}`;
    $("modalNuevoCliente").value = r.data.cliente || "";
    $("modalNuevaFechaIngreso").value = fechaValida(r.data.fechaIngreso) ? r.data.fechaIngreso : "";
    $("modalNuevaFechaEntrega").value = fechaValida(r.data.fechaEntrega) ? r.data.fechaEntrega : "";
    $("modalNuevaHoraEntrega").value = horaInput(r.data.horaEntrega);
    $("modalNuevoTotal").value = r.monto.toFixed(2);

    agregarOpcionActual(
        $("modalNuevoEstado"),
        r.data.estado || "pendiente",
        nombreEstado(r.data.estado)
    );

    agregarOpcionActual(
        $("modalNuevoMetodo"),
        r.data.metodoPago || "",
        metodoTexto(r.data.metodoPago)
    );

    $("errorEditarRecibo").textContent = "";
    abrirModal("modalEditarRecibo");
}

function abrirGasto(r = null) {
    if (!estado.db || estado.ocupado) return;

    cerrarModal("modalDetalle");
    estado.gasto = r;
    $("formGasto").reset();
    $("tituloModalGasto").textContent = r ? "Editar gasto" : "Registrar gasto";
    $("btnGuardarGasto").textContent = r ? "Guardar cambios" : "Guardar gasto";
    $("fechaGasto").value = r?.data.fecha || fechaLocal();
    $("descripcionGasto").value = r?.data.descripcion || "";
    $("montoGasto").value = r ? r.monto.toFixed(2) : "";

    agregarOpcionActual(
        $("categoriaGasto"),
        r?.data.categoria || "",
        categorias[r?.data.categoria] || r?.data.categoria
    );

    $("errorGasto").textContent = "";
    abrirModal("modalGasto");
}

function firma(valor) {
    if (valor === null || typeof valor !== "object") return JSON.stringify(valor);
    if (Array.isArray(valor)) return `[${valor.map(firma).join(",")}]`;

    return `{${Object.keys(valor).sort().map(
        clave => `${JSON.stringify(clave)}:${firma(valor[clave])}`
    ).join(",")}}`;
}

async function actualizarRegistro(r, cambios) {
    const base = firma(r.data);

    const resultado = await estado.db.ref(r.ruta).transaction(actual => {
        if (!actual || firma(actual) !== base) return;
        return { ...actual, ...cambios };
    }, undefined, false);

    if (!resultado.committed) {
        throw new Error("Este registro cambió o fue eliminado. Cierra el modal, actualiza el panel y vuelve a abrirlo.");
    }

    return guardarLocal(r, resultado.snapshot.val());
}

async function guardarRecibo(evento) {
    evento.preventDefault();
    if (estado.ocupado || !estado.edicion) return;
    if (!$("formEditarRecibo").reportValidity()) return;

    const cliente = $("modalNuevoCliente").value.trim();
    const ingreso = $("modalNuevaFechaIngreso").value;
    const entrega = $("modalNuevaFechaEntrega").value;
    const total = Number($("modalNuevoTotal").value);

    if (!cliente || !fechaValida(ingreso) || !fechaValida(entrega) || entrega < ingreso || !Number.isFinite(total) || total < 0) {
        $("errorEditarRecibo").textContent = "Revisa el nombre, el importe y las fechas. La entrega debe ser igual o posterior al ingreso.";
        return;
    }

    const r = estado.edicion;
    const ajuste = (
        centavos(r.data.ajusteHistorial) +
        centavos(total) -
        centavos(r.monto)
    ) / 100;

    const cambios = {
        cliente,
        fechaIngreso: ingreso,
        fechaEntrega: entrega,
        total: (centavos(total) / 100).toFixed(2),
        estado: $("modalNuevoEstado").value,
        metodoPago: $("modalNuevoMetodo").value,
        ajusteHistorial: ajuste,
        actualizadoEn: Date.now()
    };

    const hora = $("modalNuevaHoraEntrega").value;
    if (hora) cambios.horaEntrega = horaTexto(hora);

    $("errorEditarRecibo").textContent = "";
    establecerOcupado(true);

    try {
        await actualizarRegistro(r, cambios);
        establecerOcupado(false);
        cerrarModal("modalEditarRecibo");
        notificar("Recibo actualizado correctamente.");
    } catch (error) {
        errorFormulario("errorEditarRecibo", error);
    } finally {
        establecerOcupado(false);
    }
}

async function guardarGasto(evento) {
    evento.preventDefault();
    if (estado.ocupado || !$("formGasto").reportValidity()) return;

    const descripcion = $("descripcionGasto").value.trim();
    const fecha = $("fechaGasto").value;
    const monto = Number($("montoGasto").value);
    const categoria = $("categoriaGasto").value;

    if (!descripcion || !fechaValida(fecha) || !Number.isFinite(monto) || monto <= 0 || !categoria) {
        $("errorGasto").textContent = "Completa la descripción, fecha, categoría y un importe mayor a cero.";
        return;
    }

    const datos = {
        descripcion,
        fecha,
        monto: centavos(monto) / 100,
        categoria
    };

    $("errorGasto").textContent = "";
    establecerOcupado(true);

    try {
        if (estado.gasto) {
            await actualizarRegistro(estado.gasto, {
                ...datos,
                actualizadoEn: Date.now()
            });
        } else {
            const referencia = estado.db.ref("gastos").push();
            const nuevo = { ...datos, creadoEn: Date.now() };
            await referencia.set(nuevo);
            guardarLocal(crearRegistro("gasto", referencia.key, nuevo), nuevo);
        }

        establecerOcupado(false);
        cerrarModal("modalGasto");
        notificar("Gasto guardado correctamente.");
    } catch (error) {
        errorFormulario("errorGasto", error);
    } finally {
        establecerOcupado(false);
    }
}

function confirmarAccion({ titulo, texto, resumen, eliminar = false, escribir = false, ejecutar }) {
    cerrarModal("modalDetalle");

    estado.confirmacion = { ejecutar, escribir };
    $("tituloConfirmar").textContent = titulo;
    $("textoConfirmar").textContent = texto;
    $("resumenConfirmar").textContent = resumen || "";
    $("iconoConfirmar").textContent = eliminar ? "!" : "✓";
    $("campoConfirmacion").hidden = !escribir;
    $("textoConfirmacion").value = "";
    $("errorConfirmar").textContent = "";

    const boton = $("btnConfirmarAccion");
    boton.textContent = eliminar ? "Eliminar registros" : "Confirmar cambio";
    boton.className = `button ${eliminar ? "button-danger" : "button-primary"}`;

    abrirModal("modalConfirmar");
}

async function ejecutarConfirmacion() {
    if (estado.ocupado || !estado.confirmacion) return;

    if (estado.confirmacion.escribir && $("textoConfirmacion").value.trim() !== "ELIMINAR") {
        $("errorConfirmar").textContent = "Escribe ELIMINAR exactamente para continuar.";
        $("textoConfirmacion").focus();
        return;
    }

    $("errorConfirmar").textContent = "";
    establecerOcupado(true);

    try {
        await estado.confirmacion.ejecutar();
        establecerOcupado(false);
        cerrarModal("modalConfirmar");
        estado.confirmacion = null;
    } catch (error) {
        errorFormulario("errorConfirmar", error);
    } finally {
        establecerOcupado(false);
    }
}

function cambiarPago(r) {
    const nuevo = esPagado(r) ? "pendiente" : "pagado";

    confirmarAccion({
        titulo: nuevo === "pagado" ? "Confirmar pago" : "Marcar pendiente",
        texto: nuevo === "pagado"
            ? "Confirma que este recibo ya fue pagado. Su importe se sumará a los ingresos del periodo de entrega."
            : "Este importe dejará de sumarse a los ingresos pagados.",
        resumen: `Folio ${r.data.folio || "—"} · ${r.data.cliente || "Cliente"} · ${dinero(r.monto)}`,
        ejecutar: async () => {
            await actualizarRegistro(r, {
                estado: nuevo,
                actualizadoEn: Date.now()
            });
            notificar("Estado del pago actualizado.");
        }
    });
}

function solicitarEliminar(r) {
    confirmarAccion({
        titulo: r.tipo === "gasto" ? "Eliminar gasto" : "Eliminar recibo",
        texto: "Este registro se eliminará de la base de datos. Esta acción no se puede deshacer.",
        resumen: `${r.data.cliente || r.data.descripcion || "Registro"} · ${dinero(r.monto)}`,
        eliminar: true,
        ejecutar: async () => {
            const resultado = await estado.db.ref(r.ruta).transaction(actual => {
                if (!actual || firma(actual) !== firma(r.data)) return;
                return null;
            }, undefined, false);

            if (!resultado.committed) {
                throw new Error("El registro cambió o ya no existe. Actualiza el panel antes de eliminarlo.");
            }

            eliminarLocal([r.ruta]);
            notificar("Registro eliminado.");
        }
    });
}

function revisarEliminacionMasiva() {
    if (!estado.cargado || estado.ocupado) return;

    if (!estado.desde || !estado.hasta) {
        notificar("Selecciona Desde y Hasta y aplica el periodo.", true);
        $("filtroDesde").focus();
        return;
    }

    if ($("filtroDesde").value !== estado.desde || $("filtroHasta").value !== estado.hasta) {
        notificar("Aplica primero las fechas que acabas de seleccionar.", true);
        return;
    }

    const seleccion = [...estado.periodo];

    if (!seleccion.length) {
        notificar("No hay registros para eliminar en este periodo.");
        return;
    }

    const recibos = seleccion.filter(r => r.tipo === "recibo").length;
    const gastos = seleccion.length - recibos;

    confirmarAccion({
        titulo: "Eliminar registros del periodo",
        texto: "Se eliminarán los recibos y gastos del periodo indicado, independientemente de la búsqueda o pestaña activa. No se puede deshacer.",
        resumen: `${etiquetaPeriodo()}. ${recibos} recibos y ${gastos} gastos.`,
        eliminar: true,
        escribir: true,
        ejecutar: async () => {
            const [recibosSnap, gastosSnap] = await Promise.all([
                estado.db.ref("recibos").once("value"),
                estado.db.ref("gastos").once("value")
            ]);

            for (const r of seleccion) {
                const actual = (r.tipo === "recibo" ? recibosSnap : gastosSnap)
                    .child(r.id).val();

                if (firma(actual) !== firma(r.data)) {
                    throw new Error("Uno de los registros cambió. Cierra esta ventana y actualiza el panel antes de continuar.");
                }
            }

            const cambios = {};
            seleccion.forEach(r => {
                cambios[r.ruta] = null;
            });

            await estado.db.ref().update(cambios);
            eliminarLocal(seleccion.map(r => r.ruta));
            notificar(`${seleccion.length} registros eliminados.`);
        }
    });
}

function exportarExcel() {
    if (!estado.cargado) {
        notificar("Espera a que se carguen los datos.", true);
        return;
    }

    if (typeof XLSX === "undefined") {
        notificar("No se cargó la herramienta de Excel. Revisa tu conexión y recarga.", true);
        return;
    }

    if (!estado.periodo.length) {
        notificar("No hay registros en el periodo seleccionado.");
        return;
    }

    try {
        const recibos = estado.periodo.filter(r => r.tipo === "recibo").map(r => ({
            Folio: String(r.data.folio || ""),
            Cliente: String(r.data.cliente || ""),
            Servicio: String(r.data.servicio || ""),
            Kilos: numero(r.data.kilos),
            Total: r.monto,
            Ingreso: r.data.fechaIngreso || "",
            Entrega: r.data.fechaEntrega || "",
            Hora: r.data.horaEntrega || "",
            Estado: nombreEstado(r.data.estado),
            "Método de pago": metodoTexto(r.data.metodoPago),
            "Lavadas acumuladas": numero(r.data.lavadas),
            "Detalle del servicio": textoPlano(r.data.detalleServicio || r.data.ropaEntregada),
            "Ajuste en historial": numero(r.data.ajusteHistorial)
        }));

        const gastos = estado.periodo.filter(r => r.tipo === "gasto").map(r => ({
            Descripción: String(r.data.descripcion || ""),
            Fecha: r.data.fecha || "",
            Categoría: categorias[r.data.categoria] || r.data.categoria || "",
            Monto: r.monto
        }));

        const libro = XLSX.utils.book_new();

        const hojaRecibos = XLSX.utils.json_to_sheet(recibos, {
            header: [
                "Folio", "Cliente", "Servicio", "Kilos", "Total",
                "Ingreso", "Entrega", "Hora", "Estado", "Método de pago",
                "Lavadas acumuladas", "Detalle del servicio", "Ajuste en historial"
            ]
        });

        const hojaGastos = XLSX.utils.json_to_sheet(gastos, {
            header: ["Descripción", "Fecha", "Categoría", "Monto"]
        });

        hojaRecibos["!cols"] = [
            { wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 10 },
            { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
            { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 70 },
            { wch: 20 }
        ];

        hojaGastos["!cols"] = [
            { wch: 45 }, { wch: 14 }, { wch: 22 }, { wch: 15 }
        ];

        XLSX.utils.book_append_sheet(libro, hojaRecibos, "Recibos");
        XLSX.utils.book_append_sheet(libro, hojaGastos, "Gastos");

        const nombre = `Lavanderia_JC_${estado.desde || "inicio"}_${estado.hasta || "actual"}.xlsx`;
        XLSX.writeFile(libro, nombre);
        notificar("Excel del periodo preparado.");
    } catch (error) {
        notificar("No se pudo generar el archivo Excel.", true);
    }
}

function conectarEventos() {
    $("btnActualizar").addEventListener("click", cargarDatos);
    $("btnNuevoGasto").addEventListener("click", () => abrirGasto());
    $("btnGastoNav").addEventListener("click", () => abrirGasto());
    $("formGasto").addEventListener("submit", guardarGasto);
    $("formEditarRecibo").addEventListener("submit", guardarRecibo);
    $("btnConfirmarAccion").addEventListener("click", ejecutarConfirmacion);
    $("btnEliminarFiltrados").addEventListener("click", revisarEliminacionMasiva);
    $("btnExportar").addEventListener("click", exportarExcel);

    $("formFiltros").addEventListener("submit", evento => {
        evento.preventDefault();
        document.querySelectorAll("[data-periodo]").forEach(b => {
            b.setAttribute("aria-pressed", "false");
        });
        aplicarFiltros();
    });

    document.querySelectorAll("[data-periodo]").forEach(boton => {
        boton.addEventListener("click", () => seleccionarPeriodo(boton.dataset.periodo));
    });

    document.querySelectorAll("[data-vista]").forEach(boton => {
        boton.addEventListener("click", () => {
            estado.vista = boton.dataset.vista;
            estado.limite = 20;
            document.querySelectorAll("[data-vista]").forEach(b => {
                b.setAttribute("aria-pressed", String(b === boton));
            });
            renderizarLista();
        });
    });

    document.querySelectorAll("[data-grafica]").forEach(boton => {
        boton.addEventListener("click", () => {
            estado.grafica = boton.dataset.grafica;
            document.querySelectorAll("[data-grafica]").forEach(b => {
                b.setAttribute("aria-pressed", String(b === boton));
            });
            dibujarGraficas();
        });
    });

    $("buscarMovimiento").addEventListener("input", () => {
        estado.limite = 20;
        renderizarLista();
    });

    $("ordenMovimientos").addEventListener("change", () => {
        estado.limite = 20;
        renderizarLista();
    });

    $("btnLimpiarBusqueda").addEventListener("click", () => {
        $("buscarMovimiento").value = "";
        estado.vista = "todos";
        estado.limite = 20;
        document.querySelectorAll("[data-vista]").forEach(b => {
            b.setAttribute("aria-pressed", String(b.dataset.vista === "todos"));
        });
        renderizarLista();
    });

    $("btnCargarMas").addEventListener("click", () => {
        estado.limite += 20;
        renderizarLista();
    });

    $("lista-recibos").addEventListener("click", evento => {
        const boton = evento.target.closest("[data-detalle]");
        if (boton) abrirDetalle(boton.dataset.detalle);
    });

    $("accionesDetalle").addEventListener("click", evento => {
        const boton = evento.target.closest("[data-accion]");
        if (!boton || !estado.detalle || estado.ocupado) return;

        const r = estado.detalle;

        if (boton.dataset.accion === "editar") {
            if (r.tipo === "gasto") abrirGasto(r);
            else abrirEdicionRecibo(r);
        }

        if (boton.dataset.accion === "pago") cambiarPago(r);
        if (boton.dataset.accion === "eliminar") solicitarEliminar(r);
    });

    document.querySelectorAll("[data-cerrar]").forEach(boton => {
        boton.addEventListener("click", () => cerrarModal(boton.dataset.cerrar));
    });

    document.querySelectorAll("dialog").forEach(dialogo => {
        dialogo.addEventListener("cancel", evento => {
            if (estado.ocupado) evento.preventDefault();
        });

        dialogo.addEventListener("close", () => {
            if (!document.querySelector("dialog[open]")) {
                document.body.classList.remove("modal-open");
            }
        });
    });

    window.addEventListener("offline", () => {
        $("estadoConexion").classList.add("offline");
        $("textoConexion").textContent = "Sin conexión";
    });

    window.addEventListener("online", () => {
        $("estadoConexion").classList.remove("offline");
        $("textoConexion").textContent = "Conexión disponible";
        if (!document.querySelector("dialog[open]")) cargarDatos();
    });
}

function iniciar() {
    conectarEventos();
    seleccionarPeriodo("mes");

    try {
        if (typeof firebase === "undefined") {
            throw new Error("Firebase no disponible");
        }

        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        estado.db = firebase.database();
        cargarDatos();
    } catch (error) {
        $("estadoCarga").hidden = true;
        $("lista-recibos").setAttribute("aria-busy", "false");
        $("estadoConexion").classList.add("error");
        $("textoConexion").textContent = "Conexión no disponible";
        mensaje("No se pudo iniciar Firebase. Revisa tu conexión y recarga la página.");
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar, { once: true });
} else {
    iniciar();
}
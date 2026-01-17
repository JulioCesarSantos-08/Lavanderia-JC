const firebaseConfig = {
    apiKey: "AIzaSyCwBZMUnQ6rH3APMo4kXDiDvg_u7Zsud9w",
    authDomain: "lavanderia-nueva.firebaseapp.com",
    databaseURL: "https://lavanderia-nueva-default-rtdb.firebaseio.com",
    projectId: "lavanderia-nueva",
    storageBucket: "lavanderia-nueva.appspot.com",
    messagingSenderId: "1074532951",
    appId: "1:1074532951:web:311703f9f5441d11240912"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

window.onload = () => {
    const clave = prompt("Apartado solo para administradores, ingresa contraseña:");
    if (clave === "costa2025") {
        document.body.style.display = "flex";
        mostrarUltimoFolio();
        activarCalculoAutomatico();
    } else {
        alert("Contraseña incorrecta");
        window.location.href = "index.html";
    }
};

const PRECIOS_SERVICIO = {
    "Básico": 20,
    "Premium": 25,
    "Express": 30
};

let totalModificadoManualmente = false;

function mostrarUltimoFolio() {
    database.ref("recibos").once("value", snap => {
        let mayor = 0;
        snap.forEach(child => {
            const f = parseInt(child.val().folio);
            if (!isNaN(f) && f > mayor) mayor = f;
        });
        document.getElementById("ultimoFolio").textContent = `Último folio registrado: ${mayor}`;
        document.getElementById("folio").value = mayor + 1;
    });
}

function calcularTotal() {
    if (totalModificadoManualmente) return;

    const servicio = document.getElementById("servicio").value;
    const kilos = parseFloat(document.getElementById("kilos").value) || 0;
    let total = kilos * (PRECIOS_SERVICIO[servicio] || 0);

    document.querySelectorAll(".especial-jc").forEach(input => {
        const cant = parseInt(input.value) || 0;
        const precio = parseInt(input.dataset.precio) || 0;
        total += cant * precio;
    });

    document.getElementById("total").value = total;
}

function activarCalculoAutomatico() {
    const resetManual = () => totalModificadoManualmente = false;

    document.getElementById("servicio").addEventListener("change", () => {
        resetManual();
        calcularTotal();
    });

    document.getElementById("kilos").addEventListener("input", () => {
        resetManual();
        calcularTotal();
    });

    document.querySelectorAll(".especial-jc").forEach(input => {
        input.addEventListener("input", () => {
            resetManual();
            calcularTotal();
        });
    });

    document.getElementById("total").addEventListener("input", () => {
        totalModificadoManualmente = true;
    });
}

function mostrarFecha(fecha) {
    if (!fecha) return "";
    const [y, m, d] = fecha.split("-");
    return `${d}-${m}-${y}`;
}

function formatoHora(hora24) {
    if (!hora24) return "";
    let [h, m] = hora24.split(":");
    h = parseInt(h);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${m} ${ampm}`;
}

function fechaActual() {
    return new Date().toLocaleDateString("es-MX");
}

function generarDetalleRopaNormal() {
    let lista = [];
    document.querySelectorAll(".ropa-normal").forEach(input => {
        const cant = parseInt(input.value) || 0;
        if (cant > 0) lista.push(`${input.dataset.nombre}: ${cant}`);
    });
    return lista.length ? `<strong>Ropa normal:</strong><br>${lista.join("<br>")}` : "";
}

function generarDetalleServicio() {
    let detalle = [];
    const servicio = document.getElementById("servicio").value;
    const kilos = parseFloat(document.getElementById("kilos").value) || 0;
    const precio = PRECIOS_SERVICIO[servicio];

    if (kilos > 0) {
        detalle.push(`<strong>${servicio}:</strong> ${kilos} kg × $${precio} = $${kilos * precio}`);
    }

    const ropaNormal = generarDetalleRopaNormal();
    if (ropaNormal) detalle.push(ropaNormal);

    let especiales = [];
    document.querySelectorAll(".especial-jc").forEach(input => {
        const cant = parseInt(input.value) || 0;
        if (cant > 0) {
            especiales.push(`${input.dataset.nombre}: ${cant} × $${input.dataset.precio} = $${cant * input.dataset.precio}`);
        }
    });

    if (especiales.length) {
        detalle.push(`<strong>Prendas especiales:</strong><br>${especiales.join("<br>")}`);
    }

    return detalle.join("<br><br>");
}

function enviarDatosAFirebase(data) {
    database.ref("recibos").push(data);
}

function generarRecibo() {
    const cliente = document.getElementById("cliente").value.trim();
    if (!cliente) {
        alert("Ingresa el nombre del cliente");
        return;
    }

    const data = {
        cliente,
        folio: document.getElementById("folio").value,
        servicio: document.getElementById("servicio").value,
        kilos: document.getElementById("kilos").value,
        total: document.getElementById("total").value,
        estado: document.getElementById("estado").value.toLowerCase(),
        metodoPago: document.getElementById("metodoPago").value.toLowerCase(),
        fechaIngreso: document.getElementById("fechaIngreso").value,
        fechaEntrega: document.getElementById("fechaEntrega").value,
        horaEntrega: formatoHora(document.getElementById("horaEntrega").value),
        detalleServicio: generarDetalleServicio()
    };

    enviarDatosAFirebase(data);

    document.getElementById("fechaRecibo").textContent = fechaActual();
    document.getElementById("folioRecibo").textContent = data.folio;
    document.getElementById("clienteRecibo").textContent = data.cliente;
    document.getElementById("detalleServicio").innerHTML = data.detalleServicio;
    document.getElementById("totalRecibo").textContent = data.total;
    document.getElementById("estadoRecibo").textContent = data.estado;
    document.getElementById("pagoRecibo").textContent = data.metodoPago;
    document.getElementById("entregaRecibo").textContent = `${mostrarFecha(data.fechaEntrega)} ${data.horaEntrega}`;

    document.getElementById("recibo").classList.remove("hidden");
    document.getElementById("btnCompartir").classList.remove("hidden");
    document.getElementById("recibo").scrollIntoView({ behavior: "smooth" });
}

function compartirRecibo() {
    const recibo = document.getElementById("recibo");

    html2canvas(recibo, { scale: 3, backgroundColor: "#fff" }).then(canvas => {
        canvas.toBlob(blob => {
            const archivo = new File(
                [blob],
                `recibo_lavanderia_jc_${Date.now()}.png`,
                { type: "image/png" }
            );

            if (navigator.share) {
                navigator.share({
                    files: [archivo],
                    title: "Recibo - Lavandería JC",
                    text: "Este es su recibo del dia de hoy🧺"
                });
            } else {
                const link = document.createElement("a");
                link.download = archivo.name;
                link.href = canvas.toDataURL("image/png");
                link.click();
            }
        });
    });
}

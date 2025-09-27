// Configuración Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCwBZMUnQ6rH3APMo4kXDiDvg_u7Zsud9w",
    authDomain: "lavanderia-nueva.firebaseapp.com",
    databaseURL: "https://lavanderia-nueva-default-rtdb.firebaseio.com",
    projectId: "lavanderia-nueva",
    storageBucket: "lavanderia-nueva.firebasestorage.app",
    messagingSenderId: "1074532951",
    appId: "1:1074532951:web:311703f9f5441d11240912"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Mostrar body solo si contraseña correcta
window.onload = function() {
    const clave = prompt("Apartado solo para administradores, ingresa contraseña:");
    if (clave === "costa2025") {
        document.body.style.display = "flex";
        mostrarUltimoFolio();
    } else {
        alert("Contraseña incorrecta. No se puede acceder.");
        window.location.href = "index.html";
    }
};

// Función para obtener último folio
function mostrarUltimoFolio() {
    const folioInput = document.getElementById("folio");
    const ultimoFolioP = document.getElementById("ultimoFolio");

    database.ref("recibos").orderByChild("folio").limitToLast(1).once("value")
        .then(snapshot => {
            let nuevoFolio = 1;
            snapshot.forEach(child => {
                const folioActual = parseInt(child.val().folio) || 0;
                nuevoFolio = folioActual + 1;
            });
            folioInput.value = nuevoFolio;
            ultimoFolioP.textContent = "Último folio: " + (nuevoFolio - 1);
        })
        .catch(error => {
            console.error("Error al obtener último folio:", error);
            folioInput.value = 1;
            ultimoFolioP.textContent = "No se pudo cargar el folio";
        });
}

function enviarDatosAFirebase(cliente, folio, fechaIngreso, total, servicio, kilos, fechaEntrega, horaEntrega, ropaEntregada, lavadas, estado, metodoPago) {
    const reciboData = {
        cliente,
        folio,
        fechaIngreso,
        total,
        servicio,
        kilos,
        fechaEntrega,
        horaEntrega,
        ropaEntregada,
        lavadas,
        estado,
        metodoPago
    };

    database.ref("recibos").push(reciboData)
        .then(() => console.log("Datos enviados correctamente."))
        .catch(error => console.error("Error al enviar datos:", error));
}

function formatDate(dateString) {
    const [year, month, day] = dateString.split("-");
    return `${year}-${month}-${day}`;
}

function formatoHora(hora24) {
    const [hora, minutos] = hora24.split(":");
    const h = parseInt(hora, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const hora12 = h % 12 || 12;
    return `${hora12}:${minutos} ${ampm}`;
}

function obtenerRopa() {
    const prendas = [
        { id: "playeras", emoji: "👕" },
        { id: "pantalones", emoji: "👖" },
        { id: "shorts", emoji: "🩳" },
        { id: "tenis", emoji: "👟" },
        { id: "camisas", emoji: "👔" },
        { id: "abrigos", emoji: "🧥" },
        { id: "calcetines", emoji: "🧦" },
        { id: "vestidos", emoji: "👗" },
        { id: "toallas", emoji: "🛁" },
        { id: "sabanas", emoji: "🛏️" },
        { id: "cobijas", emoji: "🛌" },
        { id: "gorras", emoji: "🧢" },
        { id: "blusas", emoji: "👚" },
        { id: "camisetas", emoji: "👕" },
        { id: "faldas", emoji: "👒" },
        { id: "chalecos", emoji: "🦺" },
        { id: "boxers", emoji: "🩲" },
        { id: "mochilas", emoji: "🎒" }
    ];

    let resultado = [];
    prendas.forEach(p => {
        const cantidad = parseInt(document.getElementById(p.id).value) || 0;
        if (cantidad > 0) {
            resultado.push(`${p.emoji} x${cantidad}`);
        }
    });

    return resultado.join(" | ");
}

function generarRecibo() {
    const cliente = document.getElementById("cliente").value.trim();
    const servicio = document.getElementById("servicio").value;
    const kilos = document.getElementById("kilos").value;
    const lavadas = parseInt(document.getElementById("lavadas").value);
    const folio = document.getElementById("folio").value.trim();
    const fechaIngresoRaw = document.getElementById("fechaIngreso").value;
    const total = document.getElementById("total").value;
    const fechaEntregaRaw = document.getElementById("fechaEntrega").value;
    const horaEntregaRaw = document.getElementById("horaEntrega").value;
    const estado = document.getElementById("estado").value;
    const metodoPago = document.getElementById("metodoPago").value;
    const ropaEntregada = obtenerRopa();

    if (!folio || !cliente || !servicio || !kilos || isNaN(lavadas) || !fechaIngresoRaw || !total || !fechaEntregaRaw || !horaEntregaRaw || !estado || !metodoPago) {
        alert("Por favor, complete todos los campos.");
        return;
    }

    if (lavadas < 0 || lavadas > 7) {
        alert("El número de lavadas debe estar entre 0 y 7.");
        return;
    }

    const fechaIngreso = formatDate(fechaIngresoRaw);
    const fechaEntrega = formatDate(fechaEntregaRaw);
    const horaEntrega = formatoHora(horaEntregaRaw);

    enviarDatosAFirebase(cliente, folio, fechaIngreso, total, servicio, kilos, fechaEntrega, horaEntrega, ropaEntregada, lavadas, estado, metodoPago);

    let lavadorasHTML = '';
    for (let i = 0; i < lavadas; i++) {
        lavadorasHTML += `<img src="imagenes/Lavadora.png" class="lavadora-icono" alt="Lavadora">`;
    }

    let mensajeLavadas = "";
    if (lavadas === 0) {
        mensajeLavadas = "------------------------";
    } else if (lavadas <= 1) {
        mensajeLavadas = "Sigue acumulando lavadas";    
    } else if (lavadas <= 3) {
        mensajeLavadas = "¡Tus lavadas aumentan!";
    } else if (lavadas <= 5) {
        mensajeLavadas = "¡Casi obtienes tu descuento!";
    } else if (lavadas >= 7) {
        mensajeLavadas = "🎉 ¡Felicidades! Conseguiste 50% de descuento 🎉";
    }

    document.getElementById("recibo").innerHTML = `
        <h2>Gracias por visitar Lavandería JC.</h2>
        <h3>Nosotros nos preocupamos por tus prendas.</h3>
        <h4 style="color: red;">"Usted acepta que, presentarà este recibo para recibir su ropa. Sin él NO debemos entregarla. Gracias".</h4>
        <p><strong>Folio:</strong> <span class="folio">${folio}</span></p>
        <p><strong>Cliente:</strong> ${cliente}</p>
        <p><strong>Total:</strong> <span class="total">$${total}</span></p>
        <p><strong>Estado del pago:</strong> <span class="estado-pago">${estado}</span></p>
        <p><strong>Servicio:</strong> ${servicio}</p>
        <p><strong>Kilos:</strong> ${kilos} kg</p>
        <p><strong>Ropa:</strong> ${ropaEntregada || "No especificada"}</p>
        <p><strong>Entrega:</strong> ${fechaEntrega}</p>
        <p><strong>Hora:</strong> ${horaEntrega}</p>
        <div class="lavadoras-contenedor">${lavadorasHTML}</div>
        <p><strong>${mensajeLavadas}</strong></p>
    `;

    document.getElementById("recibo").classList.remove("hidden");
    document.getElementById("recibo").scrollIntoView({ behavior: 'smooth' });
}

// datos.js

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
const db = firebase.database();
const lista = document.getElementById("lista-recibos");
const totalGanancias = document.getElementById("total-ganancias");
let chart;

function mostrarRecibos() {
  const desde = document.getElementById("filtroDesde").value;
  const hasta = document.getElementById("filtroHasta").value;

  db.ref("recibos").once("value", (snapshot) => {
    db.ref("gastos").once("value", (gastosSnap) => {
      lista.innerHTML = "";
      let totalIngresos = 0;
      let totalGastos = 0;
      const gananciasPorDia = {};
      const gastosPorDia = {};

      const desdeFecha = desde ? new Date(desde + "T00:00:00") : null;
      const hastaFecha = hasta ? new Date(hasta + "T23:59:59") : null;

      const recibosArray = [];

      if (snapshot.exists()) {
        snapshot.forEach((child) => {
          const recibo = child.val();
          const clave = child.key;
          const fechaEntrega = new Date(recibo.fechaEntrega + "T00:00:00");
          const mostrar = (!desdeFecha || fechaEntrega >= desdeFecha) && (!hastaFecha || fechaEntrega <= hastaFecha);

          if (mostrar) {
            recibosArray.push({ clave, recibo });
          }
        });
      }

      recibosArray.sort((a, b) => {
        const folioA = parseInt(a.recibo.folio) || 0;
        const folioB = parseInt(b.recibo.folio) || 0;
        return folioA - folioB;
      });

      recibosArray.forEach(({ clave, recibo }) => {
        const estaPagado = recibo.estado === "pagado";
        if (estaPagado) {
          totalIngresos += parseFloat(recibo.total);
          const dia = recibo.fechaEntrega;
          gananciasPorDia[dia] = (gananciasPorDia[dia] || 0) + parseFloat(recibo.total);
        }

        const div = document.createElement("div");
        div.className = "recibo-item";
        div.innerHTML = `
          <strong>Folio:</strong> ${recibo.folio}<br>
          <strong>Cliente:</strong> ${recibo.cliente}<br>
          <strong>Servicio:</strong> ${recibo.servicio}<br>
          <strong>Kilos:</strong> ${recibo.kilos} kg<br>
          <strong>Total:</strong> $${recibo.total}<br>
          <strong>Ingreso:</strong> ${recibo.fechaIngreso}<br>
          <strong>Entrega:</strong> ${recibo.fechaEntrega} ${recibo.horaEntrega}<br>
          <strong>Ropa:</strong> ${recibo.ropaEntregada}<br>
          <strong>Lavadas acumuladas:</strong> ${recibo.lavadas}<br>
          <strong>Estado:</strong> ${recibo.estado || "pendiente"}<br>
          <strong>Método de Pago:</strong> <span style="color: ${recibo.metodoPago === 'transferencia' ? 'orange' : 'green'};">
          ${recibo.metodoPago || 'no especificado'}
          </span><br>
          <button onclick="alternarMetodoPago('${clave}')">Cambiar Método de Pago</button>
          <button onclick="editarRecibo('${clave}')">Editar</button>
          <button onclick="eliminarRecibo('${clave}')">Eliminar</button>
          ${
            recibo.estado !== "pagado" && recibo.estado !== "pedido listo"
              ? `<button onclick="marcarComoPagado('${clave}')">Sin pagar</button>`
              : `<button style="background-color: green; color: white;" onclick="marcarComoPendiente('${clave}')">Pagado</button>`
          }
        `;
        lista.appendChild(div);
      });

      if (gastosSnap.exists()) {
        gastosSnap.forEach((g) => {
          const gasto = g.val();
          const claveGasto = g.key;
          const fechaGasto = new Date(gasto.fecha + "T00:00:00");

          const mostrarGasto = (!desdeFecha || fechaGasto >= desdeFecha) && (!hastaFecha || fechaGasto <= hastaFecha);

          if (mostrarGasto) {
            totalGastos += parseFloat(gasto.monto);
            const dia = gasto.fecha;
            gastosPorDia[dia] = (gastosPorDia[dia] || 0) + parseFloat(gasto.monto);

            const div = document.createElement("div");
            div.className = "recibo-item";
            div.style.backgroundColor = "#fff0f0";
            div.innerHTML = `
              <strong>GASTO:</strong><br>
              <strong>Descripción:</strong> ${gasto.descripcion}<br>
              <strong>Monto:</strong> $${gasto.monto}<br>
              <strong>Fecha:</strong> ${gasto.fecha}<br>
              <strong>Categoría:</strong> ${gasto.categoria || 'no especificada'}<br>
              <button onclick="editarGasto('${claveGasto}')">Editar</button>
              <button onclick="eliminarGasto('${claveGasto}')">Eliminar</button>
            `;
            lista.appendChild(div);
          }
        });
      }

      totalGanancias.textContent = `Ganancia Neta: $${(totalIngresos - totalGastos).toFixed(2)}`;

      const fechasUnicas = [...new Set([...Object.keys(gananciasPorDia), ...Object.keys(gastosPorDia)])].sort();
      const datosGraficos = {};
      fechasUnicas.forEach((fecha) => {
        const ingreso = gananciasPorDia[fecha] || 0;
        const gasto = gastosPorDia[fecha] || 0;
        datosGraficos[fecha] = ingreso - gasto;
      });

      actualizarGrafica(datosGraficos);
    });
  });
}

function eliminarFiltrados() {
  const desde = document.getElementById("filtroDesde").value;
  const hasta = document.getElementById("filtroHasta").value;

  if (!desde || !hasta) {
    alert("Por favor selecciona una fecha 'Desde' y una fecha 'Hasta'.");
    return;
  }

  const confirmacion = confirm(`¿Seguro que deseas eliminar todos los recibos y gastos del ${desde} al ${hasta}? Esta acción no se puede deshacer.`);

  if (!confirmacion) return;

  const desdeFecha = new Date(desde + "T00:00:00");
  const hastaFecha = new Date(hasta + "T23:59:59");

  db.ref("recibos").once("value", (snapshot) => {
    snapshot.forEach((child) => {
      const recibo = child.val();
      const clave = child.key;
      const fechaEntrega = new Date(recibo.fechaEntrega + "T00:00:00");

      if (fechaEntrega >= desdeFecha && fechaEntrega <= hastaFecha) {
        db.ref("recibos/" + clave).remove();
      }
    });
  });

  db.ref("gastos").once("value", (snapshot) => {
    snapshot.forEach((child) => {
      const gasto = child.val();
      const clave = child.key;
      const fechaGasto = new Date(gasto.fecha + "T00:00:00");

      if (fechaGasto >= desdeFecha && fechaGasto <= hastaFecha) {
        db.ref("gastos/" + clave).remove();
      }
    });
  });

  alert("Recibos y gastos eliminados correctamente.");
  setTimeout(mostrarRecibos, 1000);
}

function alternarMetodoPago(clave) {
  db.ref("recibos/" + clave).once("value").then((snapshot) => {
    const recibo = snapshot.val();
    let nuevoMetodo = recibo.metodoPago === "efectivo" ? "transferencia" : "efectivo";

    db.ref("recibos/" + clave).update({
      metodoPago: nuevoMetodo
    }).then(() => {
      alert("Método de pago actualizado a: " + nuevoMetodo);
      mostrarRecibos();
    });
  });
}

function actualizarGrafica(datos) {
  const ctx = document.getElementById("graficaGanancias").getContext("2d");

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: Object.keys(datos),
      datasets: [{
        label: "Ganancia Neta",
        data: Object.values(datos),
        backgroundColor: "#4caf50"
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: "Ganancias Netas por Día"
        }
      }
    }
  });
}

// --- Se eliminó la segunda gráfica (graficaTipoPago) ---

function registrarGasto() {
  const fecha = document.getElementById("fechaGasto").value;
  const descripcion = document.getElementById("descripcionGasto").value;
  const monto = parseFloat(document.getElementById("montoGasto").value);
  const categoria = document.getElementById("categoriaGasto").value;

  if (!fecha || !descripcion || isNaN(monto) || !categoria) {
    alert("Todos los campos del gasto son obligatorios.");
    return;
  }

  const nuevoGasto = { fecha, descripcion, monto, categoria };
  db.ref("gastos").push(nuevoGasto).then(() => {
    alert("Gasto registrado correctamente.");
    mostrarRecibos();
  });
}

function editarGasto(clave) {
  const nuevaDescripcion = prompt("Nueva descripción:");
  const nuevoMonto = prompt("Nuevo monto:");
  if (nuevaDescripcion && !isNaN(parseFloat(nuevoMonto))) {
    db.ref("gastos/" + clave).update({
      descripcion: nuevaDescripcion,
      monto: parseFloat(nuevoMonto)
    }).then(() => {
      alert("Gasto actualizado");
      mostrarRecibos();
    });
  }
}

function editarRecibo(clave) {
  db.ref("recibos/" + clave).once("value", (snapshot) => {
    if (snapshot.exists()) {
      const recibo = snapshot.val();

      const nuevoCliente = prompt("Editar nombre del cliente:", recibo.cliente);
      const nuevaFechaIngreso = prompt("Editar fecha de ingreso (YYYY-MM-DD):", recibo.fechaIngreso);
      const nuevaFechaEntrega = prompt("Editar fecha de entrega (YYYY-MM-DD):", recibo.fechaEntrega);
      const nuevoTotal = prompt("Editar total ($):", recibo.total);

      if (
        nuevoCliente !== null &&
        nuevaFechaIngreso !== null &&
        nuevaFechaEntrega !== null &&
        nuevoTotal !== null
      ) {
        db.ref("recibos/" + clave).update({
          cliente: nuevoCliente,
          fechaIngreso: nuevaFechaIngreso,
          fechaEntrega: nuevaFechaEntrega,
          total: nuevoTotal
        }).then(() => {
          alert("Recibo actualizado correctamente.");
          mostrarRecibos();
        }).catch((error) => {
          console.error("Error al actualizar:", error);
          alert("Error al actualizar el recibo.");
        });
      }
    }
  });
}

function cerrarModalEdicion() {
  document.getElementById("modalEditarRecibo").style.display = "none";
}

function eliminarRecibo(clave) {
  if (confirm("¿Eliminar este recibo?")) {
    db.ref("recibos/" + clave).remove().then(mostrarRecibos);
  }
}

function eliminarGasto(clave) {
  if (confirm("¿Eliminar este gasto?")) {
    db.ref("gastos/" + clave).remove().then(mostrarRecibos);
  }
}

function marcarComoPagado(clave) {
  db.ref("recibos/" + clave).update({ estado: "pagado" }).then(() => {
    alert("Recibo marcado como pagado.");
    mostrarRecibos();
  });
}

function marcarComoPendiente(clave) {
  db.ref("recibos/" + clave).update({ estado: "pendiente" }).then(() => {
    alert("Recibo marcado como pendiente.");
    mostrarRecibos();
  });
}

function exportarAExcel() {
  db.ref("recibos").once("value", (snapshot) => {
    const datosRecibos = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        const recibo = child.val();
        datosRecibos.push({
          Folio: recibo.folio,
          Cliente: recibo.cliente,
          Servicio: recibo.servicio,
          Kilos: recibo.kilos,
          Total: recibo.total,
          Ingreso: recibo.fechaIngreso,
          Entrega: recibo.fechaEntrega + ' ' + recibo.horaEntrega,
          Ropa: recibo.ropaEntregada,
          "Lavadas acumuladas": recibo.lavadas,
          Estado: recibo.estado || "pendiente",
          "Metodo de Pago": recibo.metodoPago || "No especificado"
        });
      });

      const wsRecibos = XLSX.utils.json_to_sheet(datosRecibos);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsRecibos, "Recibos");

      db.ref("gastos").once("value", (gastosSnap) => {
        const datosGastos = [];
        if (gastosSnap.exists()) {
          gastosSnap.forEach((g) => {
            const gasto = g.val();
            datosGastos.push({
              Descripción: gasto.descripcion,
              Monto: gasto.monto,
              Fecha: gasto.fecha
            });
          });

          const wsGastos = XLSX.utils.json_to_sheet(datosGastos);
          XLSX.utils.book_append_sheet(wb, wsGastos, "Gastos");
        }

        XLSX.writeFile(wb, "recibos_y_gastos.xlsx");
      });
    } else {
      alert("No hay datos para exportar.");
    }
  });
}

document.getElementById("filtroDesde").addEventListener("change", mostrarRecibos);
document.getElementById("filtroHasta").addEventListener("change", mostrarRecibos);

window.onload = mostrarRecibos;

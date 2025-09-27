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

function mostrarSeccion(nombre) {
  document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
  document.getElementById(`seccion-${nombre}`).classList.add('activa');
}

let chartEfectivo = null;
let chartTransferencia = null;

async function aplicarFiltros() {
  const desde = document.getElementById('filtroDesde').value;
  const hasta = document.getElementById('filtroHasta').value;
  const estado = document.getElementById('filtroEstado').value;
  const metodoPago = document.getElementById('filtroMetodoPago').value;
  const folio = document.getElementById('filtroFolio').value.toLowerCase();

  const desdeFecha = desde ? new Date(desde + 'T00:00:00') : null;
  const hastaFecha = hasta ? new Date(hasta + 'T23:59:59') : null;

  const snapshot = await db.ref('recibos').once('value');
  const recibos = [];

  snapshot.forEach(child => {
    const r = child.val();
    const fecha = new Date(r.fechaEntrega + 'T00:00:00');
    if (
      (!desdeFecha || fecha >= desdeFecha) &&
      (!hastaFecha || fecha <= hastaFecha) &&
      (!estado || r.estado === estado) &&
      (!metodoPago || r.metodoPago === metodoPago) &&
      (!folio || (r.folio || '').toString().toLowerCase().includes(folio))
    ) {
      recibos.push(r);
    }
  });

  // Ordenar por número de folio de menor a mayor
  recibos.sort((a, b) => (parseInt(a.folio) || 0) - (parseInt(b.folio) || 0));

  mostrarTablaRecibos(recibos);
  generarGraficas(recibos);
}

function mostrarTablaRecibos(recibos) {
  const tbody = document.querySelector('#tablaRecibos tbody');
  const resumen = document.getElementById('resumenRecibos');
  tbody.innerHTML = '';

  let totalEfectivo = 0;
  let totalTransferencia = 0;

  if (recibos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">No hay datos para mostrar.</td></tr>';
    resumen.textContent = '';
    return;
  }

  recibos.forEach(r => {
    let estadoColor = '';
    if ((r.estado || '').toLowerCase() === 'pendiente') {
      estadoColor = `<td style="background-color:red; color:white; font-weight:bold;">${r.estado}</td>`;
    } else if ((r.estado || '').toLowerCase() === 'pagado') {
      estadoColor = `<td style="background-color:green; color:white; font-weight:bold;">${r.estado}</td>`;
    } else {
      estadoColor = `<td>${r.estado || ''}</td>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.folio || ''}</td>
      <td>${r.cliente || ''}</td>
      <td>$${parseFloat(r.total || 0).toFixed(2)}</td>
      <td>${r.fechaEntrega || ''}</td>
      ${estadoColor}
      <td>${r.metodoPago || ''}</td>
    `;
    tbody.appendChild(tr);

    if (r.metodoPago === 'efectivo') totalEfectivo += parseFloat(r.total || 0);
    if (r.metodoPago === 'transferencia') totalTransferencia += parseFloat(r.total || 0);
  });

  resumen.textContent = `Total en Efectivo: $${totalEfectivo.toFixed(2)} | Total en Transferencia: $${totalTransferencia.toFixed(2)}`;
}

function generarGraficas(recibos) {
  const efectivoPorFecha = {};
  const transferenciaPorFecha = {};

  recibos.forEach(r => {
    const fecha = r.fechaEntrega || '';
    const monto = parseFloat(r.total || 0);
    if (r.metodoPago === 'efectivo') {
      efectivoPorFecha[fecha] = (efectivoPorFecha[fecha] || 0) + monto;
    } else if (r.metodoPago === 'transferencia') {
      transferenciaPorFecha[fecha] = (transferenciaPorFecha[fecha] || 0) + monto;
    }
  });

  const fechas = [...new Set([...Object.keys(efectivoPorFecha), ...Object.keys(transferenciaPorFecha)])].sort();
  const datosEfectivo = fechas.map(f => efectivoPorFecha[f] || 0);
  const datosTransferencia = fechas.map(f => transferenciaPorFecha[f] || 0);

  const ctx1 = document.getElementById('graficaEfectivo').getContext('2d');
  const ctx2 = document.getElementById('graficaTransferencia').getContext('2d');

  if (chartEfectivo) chartEfectivo.destroy();
  if (chartTransferencia) chartTransferencia.destroy();

  chartEfectivo = new Chart(ctx1, {
    type: 'bar',
    data: { labels: fechas, datasets: [{ label: 'Ingresos en Efectivo', data: datosEfectivo, backgroundColor: '#28a745' }] }
  });

  chartTransferencia = new Chart(ctx2, {
    type: 'bar',
    data: { labels: fechas, datasets: [{ label: 'Ingresos por Transferencia', data: datosTransferencia, backgroundColor: '#17a2b8' }] }
  });
}

async function aplicarFiltrosGastos() {
  const desde = document.getElementById('filtroGastoDesde').value;
  const hasta = document.getElementById('filtroGastoHasta').value;
  const descripcion = document.getElementById('filtroDescripcion').value.toLowerCase();
  const categoria = document.getElementById('filtroCategoria').value;

  const desdeFecha = desde ? new Date(desde + 'T00:00:00') : null;
  const hastaFecha = hasta ? new Date(hasta + 'T23:59:59') : null;

  const snapshot = await db.ref('gastos').once('value');
  const gastos = [];

  snapshot.forEach(child => {
    const g = child.val();
    const fecha = new Date(g.fecha + 'T00:00:00');
    if (
      (!desdeFecha || fecha >= desdeFecha) &&
      (!hastaFecha || fecha <= hastaFecha) &&
      (!descripcion || (g.descripcion || '').toLowerCase().includes(descripcion)) &&
      (!categoria || (g.categoria || '').toLowerCase() === categoria)
    ) {
      gastos.push(g);
    }
  });

  mostrarTablaGastos(gastos);
}

function mostrarTablaGastos(gastos) {
  const tbody = document.querySelector('#tablaGastos tbody');
  const resumen = document.getElementById('resumenGastos');
  tbody.innerHTML = '';

  let total = 0;

  if (gastos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">No hay datos para mostrar.</td></tr>';
    resumen.textContent = '';
    return;
  }

  gastos.forEach(g => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${g.fecha || ''}</td>
      <td>${g.categoria || ''}</td>
      <td>$${parseFloat(g.monto || 0).toFixed(2)}</td>
      <td>${g.descripcion || ''}</td>
    `;
    tbody.appendChild(tr);
    total += parseFloat(g.monto || 0);
  });

  resumen.textContent = `Total de Gastos Filtrados: $${total.toFixed(2)}`;
}

// Ejecutar al cargar
aplicarFiltros();

// Añadir log de depuración al inicio
console.log('Instagram Followers Exporter: Popup script loaded');

// Funciones de utilidad
function generateCSV(followers) {
  const headers = ['Usuario', 'Nombre', 'Imagen', 'ID'];
  let csvContent = "data:text/csv;charset=utf-8," + headers.join(',') + "\n";

  followers.forEach(follower => {
    const rowData = [
      follower.username,
      follower.fullName,
      `https://instagram.com/${follower.username}`, // Placeholder para imagen
      follower.id || ''
    ];

    csvContent += rowData.map(value => 
      `"${String(value).replace(/"/g, '""')}"` // Escapar comillas
    ).join(',') + "\n";
  });

  return csvContent;
}

async function getImageAsBase64(url) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (imageUrl) => {
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.error('Error al obtener imagen:', error);
          return null;
        }
      },
      args: [url]
    });

    return result[0]?.result;
  } catch (error) {
    console.error('Error al convertir imagen:', error);
    return null;
  }
}

async function exportToExcel(followers) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Seguidores');
  
  // Configurar columnas
  worksheet.columns = [
    { header: 'Usuario', key: 'username', width: 20 },
    { header: 'Nombre', key: 'fullName', width: 30 },
    { header: 'Imagen', key: 'image', width: 50 },
    { header: 'ID', key: 'id', width: 20 }
  ];

  // Procesar cada seguidor
  for (const follower of followers) {
    const imageBase64 = await getImageAsBase64(follower.profilePicUrl);
    
    let rowData = {
      username: follower.username,
      fullName: follower.fullName,
      image: '', // Inicialmente vacío
      id: follower.id || ''
    };

    const row = worksheet.addRow(rowData);

    // Añadir imagen si se pudo convertir a base64
    if (imageBase64) {
      try {
        const imageId = workbook.addImage({
          base64: imageBase64,
          extension: 'png',
        });

        worksheet.addImage(imageId, {
          tl: { col: 2, row: row.number - 1 },
          ext: { width: 50, height: 50 }
        });
      } catch (error) {
        console.error('Error al añadir imagen:', error);
      }
    }
  }

  // Ajustar altura de filas para las imágenes
  worksheet.getRows(2, followers.length).forEach(row => {
    row.height = 50;
  });

  // Generar archivo
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  
  // Descargar archivo
  const a = document.createElement('a');
  a.href = url;
  a.download = 'seguidores.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

function getFollowers() {
  const dialog = document.querySelector('div[role="dialog"]');
  if (!dialog) return [];

  // Usar un selector más específico para los elementos de la lista
  const items = dialog.querySelectorAll('div[role="dialog"] > div > div > div > div[style*="height"] > div > div');
  
  // Usar un Set para evitar duplicados
  const uniqueFollowers = new Set();
  const followers = [];

  items.forEach(item => {
    try {
      const username = item.querySelector('a')?.href?.split('/')?.filter(Boolean)?.pop() || '';
      
      // Si ya procesamos este usuario, lo saltamos
      if (uniqueFollowers.has(username)) return;
      uniqueFollowers.add(username);

      // Buscar el nombre completo - probamos diferentes selectores
      const userLink = item.querySelector('a');
      let fullName = '';
      
      // Intentar diferentes formas de obtener el nombre
      const possibleNameContainers = [
        item.querySelector('div > div > div > div > div > div > span'),
        item.querySelector('div > div > div > span'),
        item.querySelector('div[style*="flex"] > span'),
        item.querySelector('span'),
        ...Array.from(item.querySelectorAll('span')).filter(span => 
          span.textContent && 
          span.textContent !== username &&
          !span.textContent.includes('Seguir') &&
          !span.textContent.includes('Eliminar')
        )
      ];

      // Usar el primer contenedor que tenga texto
      for (const container of possibleNameContainers) {
        if (container?.textContent?.trim()) {
          fullName = container.textContent.trim();
          break;
        }
      }

      // Si no encontramos el nombre, usar el título del enlace
      if (!fullName) {
        fullName = userLink?.getAttribute('title') || '';
      }

      const profilePicUrl = item.querySelector('img')?.src || '';

      // Solo añadir si tenemos al menos el nombre de usuario
      if (username) {
        const follower = {
          username,
          fullName: fullName.trim(),
          profilePicUrl,
          id: `https://instagram.com/${username}`
        };

        followers.push(follower);
      }
    } catch (error) {
      console.error('Error al procesar seguidor:', error);
    }
  });

  return followers;
}

function findFollowersDialog() {
  const followersLink = Array.from(document.querySelectorAll('a')).find(a => 
    (a.textContent.includes('seguidores') || a.textContent.includes('followers')) && 
    a.href.includes('/followers')
  );
  
  if (followersLink) {
    followersLink.click();
    return true;
  }
  return false;
}

function showStatus(message, color = 'black') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.style.color = color;
}

document.addEventListener('DOMContentLoaded', function() {
  // Verificar que la librería está cargada
  if (typeof ExcelJS === 'undefined') {
    console.error('La librería ExcelJS no se ha cargado correctamente');
    showStatus('Error: Librería no cargada correctamente', 'red');
    return;
  }

  const goToInstagramButton = document.getElementById('goToInstagram');
  const openFollowersButton = document.getElementById('openFollowersList');
  const exportButton = document.getElementById('exportFollowers');
  const exportTypeSelect = document.getElementById('exportType');

  // Ir a Instagram
  goToInstagramButton.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.instagram.com' });
  });

  // Abrir lista de seguidores
  openFollowersButton.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: findFollowersDialog
      });

      if (!result[0].result) {
        showStatus('No se encontró el botón de seguidores', 'red');
      }
    } catch (error) {
      console.error('Error al abrir lista:', error);
      showStatus('Error al abrir lista de seguidores', 'red');
    }
  });

  // Exportar seguidores
  exportButton.addEventListener('click', async () => {
    try {
      showStatus('Preparando exportación...', 'black');

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: getFollowers
      });

      const followers = result[0].result;
      
      if (!followers || followers.length === 0) {
        showStatus('No se encontraron seguidores para exportar', 'red');
        return;
      }

      const type = exportTypeSelect.value;

      try {
        if (type === 'csv') {
          const csvContent = generateCSV(followers);
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `instagram_followers_${new Date().toISOString().split('T')[0]}.csv`;
          link.click();
          URL.revokeObjectURL(url);
        } else {
          await exportToExcel(followers);
        }

        showStatus(`Exportados ${followers.length} seguidores`, 'green');
      } catch (error) {
        console.error('Error al exportar:', error);
        showStatus('Error al exportar. Por favor, intenta de nuevo.', 'red');
      }
    } catch (error) {
      console.error('Error general:', error);
      showStatus('Error al procesar seguidores', 'red');
    }
  });
});

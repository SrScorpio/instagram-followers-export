// Añadir un log de depuración al inicio del script
console.log('Instagram Followers Exporter: Content script loaded');

// Content script to extract followers
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Mensaje recibido:', request);

  if (request.action === "exportFollowers") {
    console.log('Iniciando exportación de seguidores');

    // Validación de página
    console.log('URL actual:', window.location.href);
    console.log('¿Es Instagram?:', window.location.href.includes('instagram.com'));

    // Verificar si estamos en la página de seguidores
    function findFollowersDialog() {
      // Intentar múltiples selectores para encontrar el diálogo de seguidores
      const selectors = [
        '._aano',  // Selector actual de Instagram
        'div[role="dialog"]',  // Selector anterior
        'div[data-testid="followers-list"]',  // Selector de prueba
        '.followers-dialog'  // Selector genérico
      ];

      for (let selector of selectors) {
        const dialog = document.querySelector(selector);
        if (dialog) {
          console.log(`Diálogo de seguidores encontrado con selector: ${selector}`);
          return dialog;
        }
      }

      console.error('No se encontró el diálogo de seguidores con ningún selector');
      return null;
    }

    const followersDialog = findFollowersDialog();

    if (!window.location.href.includes('instagram.com') || !followersDialog) {
      console.error('No estás en la página de seguidores de Instagram');
      sendResponse({
        error: "Por favor, abre la lista de seguidores en Instagram. Asegúrate de que la lista esté completamente cargada."
      });
      return true;
    }

    // Función para extraer seguidores actuales con información detallada
    function extractCurrentFollowers() {
      const followers = [];

      // Selectores para diferentes elementos
      const selectors = {
        followerItems: [
          '._aano ._ab8w ._ab94._ab97._ab9f._ab9k._ab9p._abcm',  // Selector actual
          'div[role="dialog"] a[role="link"]',  // Selector anterior
          '[data-testid="followers-list-item"]'  // Selector de prueba
        ],
        username: [
          '._aacl._aaco._aacw._aacx._aad7 span',  // Selector de nombre de usuario
          'span[dir="auto"]'  // Selector alternativo
        ],
        fullName: [
          '._aacl._aaco._aacu._aacx._aad6',  // Selector de nombre completo
          'span[dir="auto"]'  // Selector alternativo
        ],
        profileUrl: [
          'a[href^="/"]',  // Selector para enlace de perfil
          'a[role="link"]'  // Selector alternativo
        ]
      };

      // Encontrar elementos de seguidores
      let followerItems = [];
      for (let selector of selectors.followerItems) {
        followerItems = document.querySelectorAll(selector);
        if (followerItems.length > 0) break;
      }

      console.log(`Elementos de seguidores encontrados: ${followerItems.length}`);
      
      followerItems.forEach(item => {
        try {
          // Extraer información básica
          let username = '', fullName = '', profileUrl = '';

          // Extraer nombre de usuario
          for (let selector of selectors.username) {
            const usernameEl = item.querySelector(selector);
            if (usernameEl) {
              username = usernameEl.innerText || '';
              break;
            }
          }

          // Extraer nombre completo
          for (let selector of selectors.fullName) {
            const fullNameEl = item.querySelector(selector);
            if (fullNameEl) {
              fullName = fullNameEl.innerText || '';
              break;
            }
          }

          // Extraer URL de perfil
          for (let selector of selectors.profileUrl) {
            const profileLink = item.querySelector(selector);
            if (profileLink && profileLink.href) {
              profileUrl = profileLink.href;
              break;
            }
          }

          // Construir URL completa si no existe
          if (!profileUrl && username) {
            profileUrl = `https://www.instagram.com/${username}/`;
          }

          // Navegar al perfil para extraer información adicional
          const profileInfo = extractProfileInfo(profileUrl);

          // Evitar duplicados
          if (!followers.some(f => f.username === username) && username) {
            followers.push({
              username,
              fullName,
              profileUrl,
              ...profileInfo
            });
            console.log(`Seguidor extraído: ${username}`);
          }
        } catch (e) {
          console.error('Error procesando elemento de seguidor:', e);
        }
      });

      return followers;
    }

    // Función para extraer información detallada del perfil
    function extractProfileInfo(profileUrl) {
      // Nota: Esta función simula la extracción. En realidad, 
      // necesitaríamos inyectar un script en la página de perfil.
      try {
        // Intentar extraer información visible en el diálogo de seguidores
        const profileCard = document.querySelector('div[role="dialog"] div[role="button"]');
        
        // Extraer imagen de perfil
        const profileImageEl = profileCard?.querySelector('img');
        const profileImageUrl = profileImageEl?.src || '';

        // Extraer biografía
        const bioEl = profileCard?.querySelector('._aacl._aaco._aacu._aacx._aada');
        const biography = bioEl?.innerText || '';

        // Extraer sitio web
        const websiteEl = profileCard?.querySelector('a[role="link"][href*="://"]');
        const website = websiteEl?.href || '';

        // Extraer contadores (si están visibles)
        const countersEls = profileCard?.querySelectorAll('._aacl._aaco._aacw._aacx._aad6');
        let followers = 0, following = 0, posts = 0;

        if (countersEls && countersEls.length >= 3) {
          posts = parseInt(countersEls[0].innerText.replace(/\D/g, '')) || 0;
          followers = parseInt(countersEls[1].innerText.replace(/\D/g, '')) || 0;
          following = parseInt(countersEls[2].innerText.replace(/\D/g, '')) || 0;
        }

        // Verificar cuenta verificada
        const verifiedBadge = profileCard?.querySelector('svg[aria-label="Verificado"]');
        const isVerified = !!verifiedBadge;

        return {
          profileImageUrl,
          biography,
          website,
          followers,
          following,
          posts,
          isVerified
        };
      } catch (error) {
        console.error('Error extrayendo información de perfil:', error);
        return {
          profileImageUrl: '',
          biography: '',
          website: '',
          followers: 0,
          following: 0,
          posts: 0,
          isVerified: false
        };
      }
    }

    // Función principal de exportación
    async function exportFollowers() {
      const followers = [];

      // Extraer seguidores visibles inicialmente
      const initialFollowers = extractCurrentFollowers();
      followers.push(...initialFollowers);

      // Solicitar desplazamiento manual
      await requestManualScroll();

      // Extraer seguidores después del desplazamiento
      const additionalFollowers = extractCurrentFollowers();
      
      // Añadir nuevos seguidores, evitando duplicados
      additionalFollowers.forEach(follower => {
        if (!followers.some(f => f.username === follower.username)) {
          followers.push(follower);
        }
      });

      return followers;
    }

    // Función para solicitar desplazamiento manual
    function requestManualScroll() {
      return new Promise((resolve) => {
        // Enviar mensaje al popup para solicitar desplazamiento manual
        chrome.runtime.sendMessage({
          type: 'manualScrollRequest',
          message: 'Por favor, desplázate manualmente hasta el final de la lista de seguidores y haz clic en "Exportar".'
        });

        // Escuchar respuesta de confirmación de desplazamiento
        chrome.runtime.onMessage.addListener(function scrollConfirmationListener(message) {
          if (message.type === 'manualScrollComplete') {
            chrome.runtime.onMessage.removeListener(scrollConfirmationListener);
            resolve();
          }
        });
      });
    }
    
    // Iniciar extracción y manejar respuesta
    exportFollowers()
      .then(followers => {
        console.log('Total de seguidores extraídos:', followers.length);
        sendResponse({
          followers: followers,
          total: followers.length
        });
      })
      .catch(error => {
        console.error('Error de extracción:', error);
        sendResponse({
          error: error.message || "Error al extraer seguidores"
        });
      });

    // Devolver true para indicar respuesta asíncrona
    return true;
  }
  
  return true;
});

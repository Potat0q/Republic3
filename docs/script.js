// =============================================
// 1. CONFIGURACIÓN DE SUPABASE
// =============================================
const supabaseUrl = 'https://yzhtvjkjnftijzaztzqs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6aHR2amtqbmZ0aWp6YXp0enFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NjIyMzMsImV4cCI6MjEwMDIzODIzM30.HQGkaabDSjUiK-9JxczPY7R72zr8nEdTK32Pk6PMkDM';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// =============================================
// 2. USUARIO DE PRUEBA (SIN AUTENTICACIÓN)
// =============================================
let currentUser = {
    id: 'test_user_123',
    username: 'test_user',
    coins: 100
};
let currentCharacter = null;
let allCharacters = []; // Cache de personajes
let lastRwTime = 0;
let lastClaimTime = 0;

// =============================================
// 3. ELEMENTOS DEL DOM
// =============================================
const charImage = document.getElementById('char-image');
const charName = document.getElementById('char-name');
const charRarity = document.getElementById('char-rarity');
const charValue = document.getElementById('char-value');
const userCoinsSpan = document.getElementById('user-coins');
const btnRw = document.getElementById('btn-rw');
const btnClaim = document.getElementById('btn-claim');
const messageP = document.getElementById('message');

// =============================================
// 4. FUNCIONES DEL GACHA
// =============================================

// Cargar todos los personajes al inicio
async function loadCharacters() {
    try {
        const { data, error } = await supabaseClient
            .from('characters')
            .select('*');
        
        if (error) throw error;
        
        allCharacters = data || [];
        console.log(`✅ ${allCharacters.length} personajes cargados`);
        
        if (allCharacters.length === 0) {
            showMessage('⚠️ No hay personajes en la base de datos');
            return false;
        }
        return true;
    } catch (error) {
        console.error('Error cargando personajes:', error);
        showMessage('❌ Error al cargar personajes');
        return false;
    }
}

// Obtener personaje aleatorio
function getRandomCharacter() {
    if (allCharacters.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * allCharacters.length);
    return allCharacters[randomIndex];
}

// Comando #rw: Obtener personaje aleatorio
async function rwCommand() {
    // Cooldown de 1 minuto
    const now = Date.now();
    if (now - lastRwTime < 60000) {
        const remaining = Math.ceil((60000 - (now - lastRwTime)) / 1000);
        showMessage(`⏳ Espera ${remaining} segundos para usar #rw.`);
        return;
    }

    try {
        // Usar personaje aleatorio del cache
        const character = getRandomCharacter();
        
        if (!character) {
            showMessage('❌ No hay personajes disponibles.');
            return;
        }

        currentCharacter = character;
        displayCharacter(currentCharacter);
        btnClaim.disabled = false;
        showMessage('✨ ¡Personaje disponible! Usa #claim para reclamarlo.');
        lastRwTime = now;

    } catch (error) {
        console.error('Error en #rw:', error);
        showMessage('❌ Error al obtener personaje: ' + error.message);
    }
}

// Comando #claim: Reclamar personaje
async function claimCommand() {
    if (!currentCharacter) {
        showMessage('⚠️ Usa #rw primero para ver un personaje.');
        return;
    }

    // Cooldown de 5 minutos
    const now = Date.now();
    if (now - lastClaimTime < 300000) {
        const remaining = Math.ceil((300000 - (now - lastClaimTime)) / 1000);
        showMessage(`⏳ Espera ${remaining} segundos para reclamar.`);
        return;
    }

    try {
        // Verificar si ya tiene el personaje (en localStorage)
        const userInventory = JSON.parse(localStorage.getItem('user_inventory') || '[]');
        const hasCharacter = userInventory.some(item => item.character_id === currentCharacter.id);
        
        if (hasCharacter) {
            showMessage('⚠️ Ya tienes este personaje.');
            await rwCommand();
            return;
        }

        // Añadir al inventario local
        userInventory.push({
            character_id: currentCharacter.id,
            character_name: currentCharacter.name,
            acquired_at: new Date().toISOString()
        });
        localStorage.setItem('user_inventory', JSON.stringify(userInventory));

        // Actualizar monedas
        const coinsToAdd = currentCharacter.value || 0;
        currentUser.coins = (currentUser.coins || 0) + coinsToAdd;
        localStorage.setItem('user_coins', currentUser.coins);
        
        updateUI();
        showMessage(`✅ ¡Reclamaste a ${currentCharacter.name}! +${coinsToAdd} monedas.`);
        lastClaimTime = now;

        // Mostrar nuevo personaje después de 1 segundo
        setTimeout(() => {
            rwCommand();
        }, 1000);

    } catch (error) {
        console.error('Error en #claim:', error);
        showMessage('❌ Error al reclamar personaje.');
    }
}

// =============================================
// 5. FUNCIONES DE UI
// =============================================

function displayCharacter(character) {
    if (!character) return;
    
    charImage.src = character.image_url || '';
    charImage.style.display = character.image_url ? 'block' : 'none';
    charName.textContent = character.name || 'Nombre desconocido';
    charRarity.textContent = `⭐ Rareza: ${character.rarity || 'Común'}`;
    charValue.textContent = `🪙 Valor: ${character.value || 0} monedas`;
}

function updateUI() {
    if (currentUser) {
        userCoinsSpan.textContent = currentUser.coins || 0;
    }
}

function showMessage(text) {
    messageP.textContent = text;
    console.log('📝 Mensaje:', text);
}

// =============================================
// 6. FUNCIONES DE INVENTARIO
// =============================================

function showInventory() {
    const inventory = JSON.parse(localStorage.getItem('user_inventory') || '[]');
    if (inventory.length === 0) {
        showMessage('📭 No tienes personajes aún. ¡Usa #rw!');
        return;
    }
    
    const names = inventory.map(item => item.character_name).join(', ');
    showMessage(`📦 Tus personajes (${inventory.length}): ${names}`);
    console.log('📦 Inventario completo:', inventory);
}

// =============================================
// 7. INICIALIZACIÓN
// =============================================
async function init() {
    // Cargar datos guardados
    const savedCoins = localStorage.getItem('user_coins');
    if (savedCoins !== null) {
        currentUser.coins = parseInt(savedCoins);
    }
    
    updateUI();
    showMessage('🎮 ¡Cargando personajes...');
    
    // Cargar personajes desde Supabase
    const success = await loadCharacters();
    
    if (success) {
        showMessage('🎮 ¡Bienvenido al Gacha! Usa #rw para empezar.');
        await rwCommand();
    } else {
        // Si no hay personajes en Supabase, usar datos de ejemplo
        showMessage('⚠️ Usando personajes de ejemplo...');
        allCharacters = [
            { id: '1', name: 'Pikachu', rarity: 'Legendario', value: 1000, image_url: '' },
            { id: '2', name: 'Charizard', rarity: 'Épico', value: 500, image_url: '' },
            { id: '3', name: 'Bulbasaur', rarity: 'Común', value: 100, image_url: '' },
            { id: '4', name: 'Mewtwo', rarity: 'Mítico', value: 2000, image_url: '' },
            { id: '5', name: 'Eevee', rarity: 'Raro', value: 300, image_url: '' }
        ];
        await rwCommand();
    }
}

// =============================================
// 8. EVENT LISTENERS
// =============================================
btnRw.addEventListener('click', rwCommand);
btnClaim.addEventListener('click', claimCommand);

// Presiona 'I' para ver inventario
document.addEventListener('keydown', (e) => {
    if (e.key === 'i' || e.key === 'I') {
        showInventory();
    }
});

// =============================================
// 9. INICIAR
// =============================================
init();
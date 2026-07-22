// =============================================
// 1. CONFIGURACIÓN DE SUPABASE
// =============================================
const supabaseUrl = 'https://yzhtvjkjnftijzaztzqs.supabase.co/rest/v1/';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6aHR2amtqbmZ0aWp6YXp0enFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NjIyMzMsImV4cCI6MjEwMDIzODIzM30.HQGkaabDSjUiK-9JxczPY7R72zr8nEdTK32Pk6PMkDM';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// =============================================
// 2. USUARIO DE PRUEBA (SIN AUTENTICACIÓN)
// =============================================
let currentUser = {
    id: 'test_user_123',
    username: 'test_user',
    coins: 100  // Monedas iniciales
};
let currentCharacter = null;
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
// 4. FUNCIONES DEL GACHA (SIN COOLDOWN REAL)
// =============================================

// Comando #rw: Obtener personaje aleatorio
async function rwCommand() {
    // Cooldown de 1 minuto en memoria
    const now = Date.now();
    if (now - lastRwTime < 60000) {
        const remaining = Math.ceil((60000 - (now - lastRwTime)) / 1000);
        showMessage(`⏳ Espera ${remaining} segundos para usar #rw.`);
        return;
    }

    try {
        // Obtener personaje aleatorio de Supabase
        const { data, error } = await supabaseClient
            .from('characters')
            .select('*')
            .order('random()')
            .limit(1);

        if (error) throw error;
        if (!data || data.length === 0) {
            showMessage('❌ No hay personajes disponibles.');
            return;
        }

        currentCharacter = data[0];
        displayCharacter(currentCharacter);
        btnClaim.disabled = false;
        showMessage('✨ ¡Personaje disponible! Usa #claim para reclamarlo.');
        lastRwTime = now;

    } catch (error) {
        console.error('Error en #rw:', error);
        showMessage('❌ Error al obtener personaje.');
    }
}

// Comando #claim: Reclamar personaje
async function claimCommand() {
    if (!currentCharacter) {
        showMessage('⚠️ Usa #rw primero para ver un personaje.');
        return;
    }

    // Cooldown de 5 minutos en memoria
    const now = Date.now();
    if (now - lastClaimTime < 300000) {
        const remaining = Math.ceil((300000 - (now - lastClaimTime)) / 1000);
        showMessage(`⏳ Espera ${remaining} segundos para reclamar.`);
        return;
    }

    try {
        // 1. Verificar si ya tiene el personaje (en memoria local)
        const userInventory = JSON.parse(localStorage.getItem('user_inventory') || '[]');
        const hasCharacter = userInventory.some(item => item.character_id === currentCharacter.id);
        
        if (hasCharacter) {
            showMessage('⚠️ Ya tienes este personaje.');
            await rwCommand();
            return;
        }

        // 2. Añadir al inventario local
        userInventory.push({
            character_id: currentCharacter.id,
            character_name: currentCharacter.name,
            acquired_at: new Date().toISOString()
        });
        localStorage.setItem('user_inventory', JSON.stringify(userInventory));

        // 3. Actualizar monedas (en memoria)
        const coinsToAdd = currentCharacter.value || 0;
        currentUser.coins = (currentUser.coins || 0) + coinsToAdd;
        
        // Guardar monedas en localStorage
        localStorage.setItem('user_coins', currentUser.coins);
        
        // 4. Actualizar UI
        updateUI();
        showMessage(`✅ ¡Reclamaste a ${currentCharacter.name}! +${coinsToAdd} monedas.`);
        lastClaimTime = now;

        // 5. Mostrar nuevo personaje
        await rwCommand();

    } catch (error) {
        console.error('Error en #claim:', error);
        showMessage('❌ Error al reclamar personaje.');
    }
}

// =============================================
// 5. FUNCIONES DE UI
// =============================================

function displayCharacter(character) {
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
}

// =============================================
// 6. FUNCIONES DE INVENTARIO (OPCIONAL)
// =============================================

function showInventory() {
    const inventory = JSON.parse(localStorage.getItem('user_inventory') || '[]');
    if (inventory.length === 0) {
        showMessage('📭 No tienes personajes aún. ¡Usa #rw!');
        return;
    }
    
    const names = inventory.map(item => item.character_name).join(', ');
    showMessage(`📦 Tus personajes (${inventory.length}): ${names}`);
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
    showMessage('🎮 ¡Bienvenido al Gacha! Usa #rw para empezar.');
    
    // Intentar cargar primer personaje
    await rwCommand();
    
    // Mostrar ayuda con comandos
    console.log('📝 Comandos disponibles:');
    console.log('#rw - Obtener personaje aleatorio');
    console.log('#claim - Reclamar personaje actual');
    console.log('#inv - Ver tu inventario (en consola)');
}

// =============================================
// 8. EVENT LISTENERS
// =============================================
btnRw.addEventListener('click', rwCommand);
btnClaim.addEventListener('click', claimCommand);

// Comando #inv (secreto) - presiona 'I' para ver inventario
document.addEventListener('keydown', (e) => {
    if (e.key === 'i' || e.key === 'I') {
        showInventory();
    }
});

// =============================================
// 9. INICIAR
// =============================================
init();

// Mostrar cooldown cada segundo
setInterval(() => {
    const now = Date.now();
    let message = '';
    
    const rwRemaining = Math.ceil((60000 - (now - lastRwTime)) / 1000);
    const claimRemaining = Math.ceil((300000 - (now - lastClaimTime)) / 1000);
    
    if (rwRemaining > 0 && rwRemaining < 60) {
        message += `#rw: ${rwRemaining}s `;
    }
    if (claimRemaining > 0 && claimRemaining < 300) {
        message += `#claim: ${claimRemaining}s`;
    }
    
    if (message && !messageP.textContent.includes('⏳')) {
        // Mostrar cooldowns en la consola en lugar de en el mensaje principal
        console.log(`⏳ Cooldowns: ${message}`);
    }
}, 1000);
// =============================================
// 1. CONFIGURACIÓN DE SUPABASE
// =============================================
const supabaseUrl = 'https://yzhtvjkjnftijzaztzqs.supabase.co/rest/v1/';  // Tu URL
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6aHR2amtqbmZ0aWp6YXp0enFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NjIyMzMsImV4cCI6MjEwMDIzODIzM30.HQGkaabDSjUiK-9JxczPY7R72zr8nEdTK32Pk6PMkDM';  // Tu clave anon public
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;      // Usuario autenticado
let currentCharacter = null; // Personaje actual del gacha

// =============================================
// 2. ELEMENTOS DEL DOM
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
// 3. FUNCIONES DE AUTENTICACIÓN
// =============================================
async function loginDemoUser() {
    // En una app real, usarías supabase.auth.signInWithPassword()
    // Para pruebas, usamos un usuario fijo que ya existe en profiles
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('username', 'demo_user')  // Asegúrate de que exista
        .single();
    
    if (error) {
        console.error('Error al obtener perfil:', error);
        return;
    }
    
    currentUser = data;
    updateUI();
    showMessage('✅ Sesión iniciada como: ' + currentUser.username);
}

// =============================================
// 4. FUNCIONES DEL GACHA
// =============================================

// Comando #rw: Obtener personaje aleatorio
async function rwCommand() {
    if (!currentUser) {
        showMessage('⚠️ Inicia sesión primero.');
        return;
    }

    // Verificar cooldown de 1 minuto
    const canUse = await checkCooldown('rw');
    if (!canUse) {
        showMessage('⏳ Espera 1 minuto para usar #rw.');
        return;
    }

    try {
        // Obtener personaje aleatorio de la tabla 'characters'
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

        // Actualizar cooldown de #rw
        await updateCooldown('rw');

    } catch (error) {
        console.error('Error en #rw:', error);
        showMessage('❌ Error al obtener personaje.');
    }
}

// Comando #claim: Reclamar personaje
async function claimCommand() {
    if (!currentUser) {
        showMessage('⚠️ Inicia sesión primero.');
        return;
    }
    if (!currentCharacter) {
        showMessage('⚠️ Usa #rw primero para ver un personaje.');
        return;
    }

    // Verificar cooldown de 5 minutos
    const canClaim = await checkCooldown('claim');
    if (!canClaim) {
        showMessage('⏳ Espera 5 minutos entre reclamos.');
        return;
    }

    try {
        // 1. Verificar si ya tiene el personaje
        const { data: existing, error: checkError } = await supabaseClient
            .from('inventory')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('character_id', currentCharacter.id)
            .maybeSingle();

        if (checkError) throw checkError;
        if (existing) {
            showMessage('⚠️ Ya tienes este personaje.');
            await rwCommand();  // Mostrar otro
            return;
        }

        // 2. Añadir al inventario
        const { error: insertError } = await supabaseClient
            .from('inventory')
            .insert({
                user_id: currentUser.id,
                character_id: currentCharacter.id
            });

        if (insertError) throw insertError;

        // 3. Actualizar monedas del usuario
        const newCoins = (currentUser.coins || 0) + (currentCharacter.value || 0);
        const { error: updateError } = await supabaseClient
            .from('profiles')
            .update({ coins: newCoins })
            .eq('id', currentUser.id);

        if (updateError) throw updateError;

        // 4. Actualizar UI
        currentUser.coins = newCoins;
        updateUI();
        showMessage(`✅ ¡Reclamaste a ${currentCharacter.name}! +${currentCharacter.value} monedas.`);

        // 5. Actualizar cooldown de #claim
        await updateCooldown('claim');

        // 6. Mostrar nuevo personaje
        await rwCommand();

    } catch (error) {
        console.error('Error en #claim:', error);
        showMessage('❌ Error al reclamar personaje.');
    }
}

// =============================================
// 5. FUNCIONES DE COOLDOWNS
// =============================================

// Verificar si el usuario puede usar rw o claim
async function checkCooldown(tipo) {
    const { data, error } = await supabaseClient
        .from('cooldowns')
        .select('last_rw, last_claim')
        .eq('user_id', currentUser.id)
        .single();

    if (error) {
        // Si no existe registro, crear uno nuevo
        await supabaseClient
            .from('cooldowns')
            .insert({ user_id: currentUser.id });
        return true;
    }

    const now = new Date();
    let lastTime;
    let waitSeconds;

    if (tipo === 'rw') {
        lastTime = new Date(data.last_rw);
        waitSeconds = 60;  // 1 minuto
    } else if (tipo === 'claim') {
        lastTime = new Date(data.last_claim);
        waitSeconds = 300; // 5 minutos
    }

    const diffSeconds = (now - lastTime) / 1000;
    return diffSeconds >= waitSeconds;
}

// Actualizar el cooldown después de usar rw o claim
async function updateCooldown(tipo) {
    const updateData = { user_id: currentUser.id };
    if (tipo === 'rw') {
        updateData.last_rw = new Date().toISOString();
    } else if (tipo === 'claim') {
        updateData.last_claim = new Date().toISOString();
    }

    const { error } = await supabaseClient
        .from('cooldowns')
        .upsert(updateData);

    if (error) console.error('Error actualizando cooldown:', error);
}

// =============================================
// 6. FUNCIONES DE UI
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
// 7. INICIALIZACIÓN
// =============================================
async function init() {
    await loginDemoUser();
    await rwCommand();  // Mostrar primer personaje
}

// Event listeners
btnRw.addEventListener('click', rwCommand);
btnClaim.addEventListener('click', claimCommand);

// Iniciar la página
init();

// Mostrar cooldown en tiempo real (opcional)
setInterval(() => {
    // Aquí podrías actualizar el contador de tiempo restante
}, 1000);

// =============================================
// 1. CONFIGURACIÓN DE SUPABASE
// =============================================
const supabaseUrl = 'https://yzhtvjkjnftijzaztzqs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6aHR2amtqbmZ0aWp6YXp0enFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NjIyMzMsImV4cCI6MjEwMDIzODIzM30.HQGkaabDSjUiK-9JxczPY7R72zr8nEdTK32Pk6PMkDM';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// =============================================
// 2. ESTADO DE LA APLICACIÓN
// =============================================
let currentUser = null;
let currentCharacter = null;
let charactersCount = 0;
let lastRwTime = 0;
let lastClaimTime = 0;
let isGuest = false;

// ⏱️ TIEMPOS DE COOLDOWN (en segundos)
const COOLDOWN_RW = 3;        // 3 segundos entre #rw
const COOLDOWN_CLAIM = 30;    // 30 segundos entre #claim

// =============================================
// 3. ELEMENTOS DEL DOM
// =============================================
const charImage = document.getElementById('char-image');
const charPlaceholder = document.getElementById('charPlaceholder');
const charName = document.getElementById('char-name');
const charRarity = document.getElementById('char-rarity');
const charValue = document.getElementById('char-value');
const userCoinsSpan = document.getElementById('user-coins');
const displayUsername = document.getElementById('displayUsername');
const userBadge = document.getElementById('userBadge');
const guestBadge = document.getElementById('guestBadge');
const btnRw = document.getElementById('btn-rw');
const btnClaim = document.getElementById('btn-claim');
const messageP = document.getElementById('message');
const btnGuest = document.getElementById('btnGuest');
const btnLogin = document.getElementById('btnLogin');
const btnRegister = document.getElementById('btnRegister');
const btnLogout = document.getElementById('btnLogout');
const characterCard = document.getElementById('characterCard');
const btnAdmin = document.getElementById('btnAdmin');

// Modales
const loginModal = document.getElementById('loginModal');
const registerModal = document.getElementById('registerModal');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');
const closeLoginModal = document.getElementById('closeLoginModal');
const closeRegisterModal = document.getElementById('closeRegisterModal');
const switchToRegister = document.getElementById('switchToRegister');
const switchToLogin = document.getElementById('switchToLogin');

// =============================================
// 4. FUNCIONES DE LOS MODALES
// =============================================

function openModal(modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    if (modal === loginModal) {
        loginError.textContent = '';
        loginForm.reset();
    }
    if (modal === registerModal) {
        registerError.textContent = '';
        registerForm.reset();
    }
}

document.addEventListener('click', (e) => {
    if (e.target === loginModal) closeModal(loginModal);
    if (e.target === registerModal) closeModal(registerModal);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal(loginModal);
        closeModal(registerModal);
    }
});

btnLogin.addEventListener('click', () => openModal(loginModal));
btnRegister.addEventListener('click', () => openModal(registerModal));
closeLoginModal.addEventListener('click', () => closeModal(loginModal));
closeRegisterModal.addEventListener('click', () => closeModal(registerModal));

switchToRegister.addEventListener('click', () => {
    closeModal(loginModal);
    setTimeout(() => openModal(registerModal), 300);
});

switchToLogin.addEventListener('click', () => {
    closeModal(registerModal);
    setTimeout(() => openModal(loginModal), 300);
});

// =============================================
// 5. FUNCIONES DE AUTENTICACIÓN
// =============================================

function generateGuestName() {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000);
    return `Guest-${timestamp}${random}`;
}

async function loginAsGuest() {
    try {
        showMessage('🔄 Creando invitado...');
        
        const username = generateGuestName();
        
        const { data, error } = await supabaseClient
            .from('profiles')
            .insert({
                username: username,
                is_guest: true,
                coins: 50
            })
            .select()
            .single();
        
        if (error) {
            if (error.code === '23505') {
                return await loginAsGuest();
            }
            throw error;
        }
        
        currentUser = data;
        isGuest = true;
        
        try {
            await supabaseClient
                .from('cooldowns')
                .insert({ user_id: currentUser.id });
        } catch (cooldownError) {
            console.warn('Error al crear cooldown:', cooldownError);
        }
        
        updateUI();
        showMessage(`🎮 ¡Bienvenido ${currentUser.username}! (Invitado)`);
        
        document.getElementById('authButtons').style.display = 'none';
        btnLogout.style.display = 'block';
        guestBadge.style.display = 'inline-block';
        userBadge.style.display = 'none';
        
        await loadCharacters();
        await rwCommand();
        
    } catch (error) {
        console.error('Error en login guest:', error);
        showMessage('❌ Error al crear invitado: ' + (error.message || 'Intenta de nuevo'));
    }
}

async function loginWithEmail(email, password) {
    try {
        showMessage('🔄 Iniciando sesión...');
        
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (authError) throw authError;
        
        if (!authData.user) {
            throw new Error('No se pudo autenticar el usuario');
        }
        
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .maybeSingle();
        
        if (profileError && profileError.code !== 'PGRST116') throw profileError;
        
        if (!profile) {
            const username = email.split('@')[0] + '_' + Math.floor(Math.random() * 1000);
            const { data: newProfile, error: createError } = await supabaseClient
                .from('profiles')
                .insert({
                    id: authData.user.id,
                    username: username,
                    email: email,
                    coins: 100,
                    is_guest: false
                })
                .select()
                .single();
            
            if (createError) throw createError;
            currentUser = newProfile;
        } else {
            currentUser = profile;
        }
        
        isGuest = false;
        
        const { data: cooldownData } = await supabaseClient
            .from('cooldowns')
            .select('*')
            .eq('user_id', currentUser.id)
            .maybeSingle();
        
        if (!cooldownData) {
            try {
                await supabaseClient
                    .from('cooldowns')
                    .insert({ user_id: currentUser.id });
            } catch (cooldownError) {
                console.warn('Error al crear cooldown:', cooldownError);
            }
        }
        
        updateUI();
        showMessage(`✅ ¡Bienvenido ${currentUser.username}!`);
        
        document.getElementById('authButtons').style.display = 'none';
        btnLogout.style.display = 'block';
        userBadge.style.display = 'inline-block';
        guestBadge.style.display = 'none';
        
        closeModal(loginModal);
        loginError.textContent = '';
        
        await loadCharacters();
        await rwCommand();
        
    } catch (error) {
        console.error('Error en login:', error);
        loginError.textContent = '❌ ' + (error.message || 'Error al iniciar sesión');
    }
}

async function registerUser(username, email, password) {
    try {
        showMessage('🔄 Registrando usuario...');
        
        const { data: existingUser } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('username', username)
            .maybeSingle();
        
        if (existingUser) {
            registerError.textContent = '❌ El nombre de usuario ya está en uso';
            return;
        }
        
        const { data: existingEmail } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        
        if (existingEmail) {
            registerError.textContent = '❌ El correo electrónico ya está registrado';
            return;
        }
        
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    username: username
                }
            }
        });
        
        if (authError) {
            if (authError.message.includes('already registered')) {
                registerError.textContent = '❌ Este correo ya está registrado';
                return;
            }
            throw authError;
        }
        
        if (!authData.user) {
            throw new Error('No se pudo crear el usuario');
        }
        
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .insert({
                id: authData.user.id,
                username: username,
                email: email,
                coins: 100,
                is_guest: false
            })
            .select()
            .single();
        
        if (profileError) throw profileError;
        
        currentUser = profile;
        isGuest = false;
        
        try {
            await supabaseClient
                .from('cooldowns')
                .insert({ user_id: currentUser.id });
        } catch (cooldownError) {
            console.warn('Error al crear cooldown:', cooldownError);
        }
        
        updateUI();
        showMessage(`✅ ¡Cuenta creada! Bienvenido ${currentUser.username}`);
        
        document.getElementById('authButtons').style.display = 'none';
        btnLogout.style.display = 'block';
        userBadge.style.display = 'inline-block';
        guestBadge.style.display = 'none';
        
        closeModal(registerModal);
        registerError.textContent = '';
        
        await loadCharacters();
        await rwCommand();
        
    } catch (error) {
        console.error('Error en registro:', error);
        registerError.textContent = '❌ ' + (error.message || 'Error al registrar usuario');
    }
}

async function logout() {
    try {
        if (!isGuest) {
            await supabaseClient.auth.signOut();
        }
        
        currentUser = null;
        isGuest = false;
        currentCharacter = null;
        charactersCount = 0;
        
        displayUsername.textContent = 'Invitado';
        userCoinsSpan.textContent = '0';
        charName.textContent = '???';
        charRarity.textContent = '⭐ Esperando...';
        charValue.textContent = '🪙 0 monedas';
        charImage.style.display = 'none';
        charPlaceholder.style.display = 'flex';
        btnClaim.disabled = true;
        characterCard.classList.remove('has-character');
        userBadge.style.display = 'none';
        guestBadge.style.display = 'none';
        
        document.getElementById('authButtons').style.display = 'flex';
        btnLogout.style.display = 'none';
        
        showMessage('👋 Sesión cerrada. ¡Vuelve pronto!');
        
    } catch (error) {
        console.error('Error en logout:', error);
        showMessage('❌ Error al cerrar sesión');
    }
}

// =============================================
// 6. FUNCIONES DEL GACHA (OPTIMIZADAS)
// =============================================

async function loadCharacters() {
    try {
        const { count, error } = await supabaseClient
            .from('characters')
            .select('*', { count: 'exact', head: true });
        
        if (error) {
            console.error('Error contando personajes:', error);
            charactersCount = 5;
            showMessage('📝 Usando personajes de ejemplo (error de conexión)');
            return true;
        }
        
        charactersCount = count;
        console.log(`✅ ${charactersCount} personajes disponibles en la base de datos`);
        showMessage(`🎮 ${charactersCount} personajes disponibles`);
        return true;
        
    } catch (error) {
        console.error('Error en loadCharacters:', error);
        charactersCount = 5;
        return true;
    }
}

// ✅ Función optimizada sin RPC
async function getRandomCharacter() {
    try {
        // Si no tenemos el total, obtenerlo
        if (!charactersCount || charactersCount === 0) {
            const { count, error } = await supabaseClient
                .from('characters')
                .select('*', { count: 'exact', head: true });
            
            if (error) throw error;
            charactersCount = count;
        }

        // Generar offset aleatorio cada vez
        const randomOffset = Math.floor(Math.random() * charactersCount);
        
        const { data, error } = await supabaseClient
            .from('characters')
            .select('*')
            .range(randomOffset, randomOffset);
        
        if (error) throw error;
        if (!data || data.length === 0) return null;
        return data[0];
    } catch (error) {
        console.error('Error obteniendo personaje aleatorio:', error);
        return null;
    }
}

// ⚡ rwCommand: CON COOLDOWN
async function rwCommand() {
    if (!currentUser) {
        showMessage('⚠️ Inicia sesión o juega como invitado primero.');
        return;
    }

    // Verificar cooldown
    const now = Date.now();
    const timeSinceRw = (now - lastRwTime) / 1000;
    if (timeSinceRw < COOLDOWN_RW) {
        const remaining = Math.ceil(COOLDOWN_RW - timeSinceRw);
        showMessage(`⏳ Espera ${remaining} segundos para usar #rw.`);
        return;
    }

    try {
        const character = await getRandomCharacter();
        
        if (!character) {
            showMessage('❌ No hay personajes disponibles.');
            return;
        }

        currentCharacter = character;
        displayCharacter(currentCharacter);
        btnClaim.disabled = false;
        characterCard.classList.add('has-character');
        showMessage('✨ ¡Personaje disponible! Usa #claim para reclamarlo.');
        lastRwTime = now;

        if (!isGuest && currentUser) {
            try {
                await supabaseClient
                    .from('cooldowns')
                    .upsert({ 
                        user_id: currentUser.id, 
                        last_rw: new Date().toISOString() 
                    });
            } catch (cooldownError) {
                console.warn('Error actualizando cooldown de rw:', cooldownError);
            }
        }

    } catch (error) {
        console.error('Error en #rw:', error);
        showMessage('❌ Error al obtener personaje');
    }
}

// ⚡ claimCommand: CON COOLDOWN Y VERIFICACIÓN GLOBAL
async function claimCommand() {
    if (!currentUser) {
        showMessage('⚠️ Inicia sesión o juega como invitado primero.');
        return;
    }
    
    if (!currentCharacter) {
        showMessage('⚠️ Usa #rw primero para ver un personaje.');
        return;
    }

    // Verificar cooldown de claim
    const now = Date.now();
    const timeSinceClaim = (now - lastClaimTime) / 1000;
    if (timeSinceClaim < COOLDOWN_CLAIM) {
        const remaining = Math.ceil(COOLDOWN_CLAIM - timeSinceClaim);
        showMessage(`⏳ Espera ${remaining} segundos para reclamar.`);
        return;
    }

    try {
        const coinsToAdd = currentCharacter.value || 0;
        
        if (isGuest) {
            currentUser.coins = (currentUser.coins || 0) + coinsToAdd;
            updateUI();
            showMessage(`🎮 [MODO GUEST] Reclamaste a ${currentCharacter.name}! +${coinsToAdd} monedas (no se guarda)`);
            lastClaimTime = now;
            setTimeout(() => rwCommand(), 500);
            return;
        }

        const characterId = currentCharacter.mal_id;
        
        // 🔥 VERIFICAR SI ALGUIEN MÁS YA LO RECLAMÓ
        const { data: existingGlobal, error: checkGlobalError } = await supabaseClient
            .from('inventory')
            .select('user_id, profiles!inner(username)')
            .eq('character_id', characterId)
            .maybeSingle();

        if (checkGlobalError) {
            console.error('Error verificando disponibilidad global:', checkGlobalError);
        }

        if (existingGlobal) {
            const ownerName = existingGlobal.profiles?.username || 'otro usuario';
            showMessage(`⚠️ Este personaje ya fue reclamado por ${ownerName}.`);
            // Mostrar otro personaje automáticamente
            await rwCommand();
            return;
        }

        // Verificar si el usuario actual ya lo tiene
        const { data: existingUser, error: checkUserError } = await supabaseClient
            .from('inventory')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('character_id', characterId)
            .maybeSingle();

        if (checkUserError) {
            console.error('Error verificando inventario del usuario:', checkUserError);
        }
        
        if (existingUser) {
            showMessage('⚠️ Ya tienes este personaje.');
            await rwCommand();
            return;
        }

        // Insertar en inventario
        const { error: insertError } = await supabaseClient
            .from('inventory')
            .insert({
                user_id: currentUser.id,
                character_id: characterId
            });

        if (insertError) {
            console.error('Error insertando en inventario:', insertError);
            showMessage('⚠️ Error al guardar personaje. Intenta de nuevo.');
            return;
        }

        // Actualizar monedas
        const newCoins = (currentUser.coins || 0) + coinsToAdd;
        
        const { error: updateError } = await supabaseClient
            .from('profiles')
            .update({ coins: newCoins })
            .eq('id', currentUser.id);

        if (updateError) {
            console.error('Error actualizando monedas:', updateError);
            showMessage('⚠️ Error al actualizar monedas.');
            return;
        }

        currentUser.coins = newCoins;
        updateUI();
        showMessage(`✅ ¡Reclamaste a ${currentCharacter.name}! +${coinsToAdd} monedas.`);
        lastClaimTime = now;

        try {
            await supabaseClient
                .from('cooldowns')
                .upsert({ 
                    user_id: currentUser.id, 
                    last_claim: new Date().toISOString() 
                });
        } catch (cooldownError) {
            console.warn('Error actualizando cooldown:', cooldownError);
        }

        setTimeout(() => rwCommand(), 500);

    } catch (error) {
        console.error('Error en #claim:', error);
        showMessage('❌ Error al reclamar personaje: ' + (error.message || ''));
    }
}

// =============================================
// 7. FUNCIONES DE UI
// =============================================

function displayCharacter(character) {
    if (!character) return;
    
    const imgUrl = character.image_jpg_url || character.image_webp_url || '';
    
    if (imgUrl) {
        charImage.src = imgUrl;
        charImage.style.display = 'block';
        charPlaceholder.style.display = 'none';
    } else {
        charImage.style.display = 'none';
        charPlaceholder.style.display = 'flex';
        charPlaceholder.textContent = '⭐';
    }
    
    charName.textContent = character.name || 'Nombre desconocido';
    charRarity.textContent = `⭐ Rareza: ${character.rarity || 'Común'}`;
    charValue.textContent = `🪙 Valor: ${character.value || 0} monedas`;
}

function updateUI() {
    if (currentUser) {
        displayUsername.textContent = currentUser.username;
        userCoinsSpan.textContent = currentUser.coins || 0;
        // Mostrar el botón de admin si es administrador
        updateAdminButton();
    } else {
        displayUsername.textContent = 'Invitado';
        userCoinsSpan.textContent = '0';
    }
}

function showMessage(text) {
    messageP.textContent = text;
    console.log('📝 Mensaje:', text);
}

// =============================================
// 8. FUNCIONES DE INVENTARIO
// =============================================

async function showInventory() {
    if (!currentUser) {
        showMessage('⚠️ Inicia sesión o juega como invitado primero.');
        return;
    }

    if (isGuest) {
        showMessage('🎮 [MODO GUEST] No se guarda inventario.');
        return;
    }

    try {
        // Obtener los IDs del inventario
        const { data: inventoryData, error: invError } = await supabaseClient
            .from('inventory')
            .select('character_id')
            .eq('user_id', currentUser.id);

        if (invError) {
            console.error('Error consultando inventario:', invError);
            showMessage('❌ Error al mostrar inventario');
            return;
        }

        if (!inventoryData || inventoryData.length === 0) {
            showMessage('📭 No tienes personajes aún. ¡Usa #rw!');
            return;
        }

        // Obtener los personajes por sus IDs
        const characterIds = inventoryData.map(item => item.character_id);
        
        const { data: charactersData, error: charError } = await supabaseClient
            .from('characters')
            .select('name, rarity, value, mal_id')
            .in('mal_id', characterIds);

        if (charError) {
            console.error('Error consultando personajes:', charError);
            showMessage('❌ Error al mostrar inventario');
            return;
        }

        const names = charactersData.map(char => char.name).join(', ');
        showMessage(`📦 Tus personajes (${charactersData.length}): ${names}`);
        console.log('📦 Inventario completo:', charactersData);
    } catch (error) {
        console.error('Error mostrando inventario:', error);
        showMessage('❌ Error al mostrar inventario');
    }
}

// =============================================
// 9. FUNCIONES DE ADMINISTRADOR
// =============================================

// Verificar si el usuario es administrador
function isAdmin() {
    if (!currentUser) return false;
    // Cambia esto por tu correo
    const adminEmails = ['maxpotato001@gmail.com'];
    return adminEmails.includes(currentUser.email);
}

// Mostrar/Ocultar botón de admin
function updateAdminButton() {
    const btnAdmin = document.getElementById('btnAdmin');
    if (btnAdmin) {
        btnAdmin.style.display = isAdmin() ? 'inline-block' : 'none';
    }
}

// Panel de administrador
async function openAdminPanel() {
    if (!isAdmin()) {
        showMessage('⛔ No tienes permisos de administrador.');
        return;
    }

    showMessage('👑 Panel de administrador abierto en consola (F12)');
    console.log('👑 ========== PANEL DE ADMINISTRADOR ==========');
    console.log('1. Ver todos los usuarios:');
    console.log('   await adminListUsers();');
    console.log('2. Ver inventario de un usuario:');
    console.log('   await adminViewInventory("user_id");');
    console.log('3. Eliminar un personaje del inventario:');
    console.log('   await adminRemoveCharacter("user_id", "character_id");');
    console.log('4. Eliminar todo el inventario de un usuario:');
    console.log('   await adminClearInventory("user_id");');
    console.log('5. Ver personajes reclamados globalmente:');
    console.log('   await adminGlobalInventory();');
    console.log('6. Eliminar un personaje GLOBALMENTE:');
    console.log('   await adminDeleteCharacterGlobally("character_id");');
    console.log('7. Buscar un usuario por nombre:');
    console.log('   await adminFindUser("nombre");');
}

// =============================================
// FUNCIONES DE ADMINISTRADOR
// =============================================

// 1. Listar todos los usuarios
async function adminListUsers() {
    if (!isAdmin()) return;
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('id, username, email, coins');
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.table(data);
    return data;
}

// 2. Ver inventario de un usuario
async function adminViewInventory(userId) {
    if (!isAdmin()) return;
    const { data, error } = await supabaseClient
        .from('inventory')
        .select('character_id, characters(name, rarity, value)')
        .eq('user_id', userId);
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.table(data);
    return data;
}

// 3. Eliminar un personaje del inventario de un usuario
async function adminRemoveCharacter(userId, characterId) {
    if (!isAdmin()) return;
    const { error } = await supabaseClient
        .from('inventory')
        .delete()
        .eq('user_id', userId)
        .eq('character_id', characterId);
    if (error) {
        console.error('Error al eliminar:', error);
        showMessage('❌ Error al eliminar personaje.');
    } else {
        showMessage(`✅ Personaje ${characterId} eliminado del usuario.`);
        console.log(`✅ Personaje ${characterId} eliminado.`);
    }
}

// 4. Eliminar todo el inventario de un usuario
async function adminClearInventory(userId) {
    if (!isAdmin()) return;
    const confirmDelete = confirm(`¿Eliminar TODO el inventario del usuario ${userId}?`);
    if (!confirmDelete) return;
    const { error } = await supabaseClient
        .from('inventory')
        .delete()
        .eq('user_id', userId);
    if (error) {
        console.error('Error al eliminar inventario:', error);
        showMessage('❌ Error al eliminar inventario.');
    } else {
        showMessage(`✅ Inventario del usuario eliminado.`);
        console.log(`✅ Inventario del usuario ${userId} eliminado.`);
    }
}

// 5. Ver todos los personajes reclamados globalmente
async function adminGlobalInventory() {
    if (!isAdmin()) return;
    const { data, error } = await supabaseClient
        .from('inventory')
        .select('user_id, profiles(username), character_id, characters(name, rarity)');
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.table(data);
    return data;
}

// 6. Eliminar un personaje GLOBALMENTE (de todos los usuarios)
async function adminDeleteCharacterGlobally(characterId) {
    if (!isAdmin()) return;
    const confirmDelete = confirm(`¿Eliminar el personaje ${characterId} de TODOS los usuarios?`);
    if (!confirmDelete) return;
    const { error } = await supabaseClient
        .from('inventory')
        .delete()
        .eq('character_id', characterId);
    if (error) {
        console.error('Error al eliminar personaje globalmente:', error);
        showMessage('❌ Error al eliminar personaje globalmente.');
    } else {
        showMessage(`✅ Personaje ${characterId} eliminado globalmente.`);
        console.log(`✅ Personaje ${characterId} eliminado de TODOS los usuarios.`);
    }
}

// 7. Obtener el user_id de un usuario por su nombre
async function adminFindUser(username) {
    if (!isAdmin()) return;
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('id, username, email')
        .ilike('username', `%${username}%`);
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.table(data);
    return data;
}

// =============================================
// 10. INICIALIZACIÓN
// =============================================
async function init() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (session) {
            const { data: profile } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .maybeSingle();
            
            if (profile) {
                currentUser = profile;
                isGuest = false;
                document.getElementById('authButtons').style.display = 'none';
                btnLogout.style.display = 'block';
                userBadge.style.display = 'inline-block';
                guestBadge.style.display = 'none';
                updateUI();
                showMessage(`✅ Bienvenido de nuevo ${currentUser.username}`);
                await loadCharacters();
                await rwCommand();
                return;
            }
        }
    } catch (error) {
        console.log('No hay sesión activa');
    }
    
    showMessage('🎮 ¡Bienvenido! Inicia sesión o juega como invitado.');
}

// =============================================
// 11. EVENT LISTENERS
// =============================================

btnRw.addEventListener('click', rwCommand);
btnClaim.addEventListener('click', claimCommand);
btnGuest.addEventListener('click', loginAsGuest);
btnLogout.addEventListener('click', logout);

// Botón de administrador
if (btnAdmin) {
    btnAdmin.addEventListener('click', openAdminPanel);
}

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    loginWithEmail(email, password);
});

registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    registerUser(username, email, password);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'i' || e.key === 'I') {
        showInventory();
    }
});

// =============================================
// 12. INICIAR
// =============================================
init();

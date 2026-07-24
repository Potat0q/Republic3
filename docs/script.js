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
const menuPrincipal = document.getElementById('menuPrincipal');
const gachaApp = document.getElementById('gachaApp');

// Elementos del menú
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const registerUsername = document.getElementById('registerUsername');
const registerEmail = document.getElementById('registerEmail');
const registerPassword = document.getElementById('registerPassword');
const btnLoginMenu = document.getElementById('btnLoginMenu');
const btnRegisterMenu = document.getElementById('btnRegisterMenu');
const btnGuestMenu = document.getElementById('btnGuestMenu');
const switchToRegisterMenu = document.getElementById('switchToRegisterMenu');
const switchToLoginMenu = document.getElementById('switchToLoginMenu');
const loginFormContainer = document.getElementById('loginFormContainer');
const registerFormContainer = document.getElementById('registerFormContainer');

// Elementos del gacha
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
const btnLogout = document.getElementById('btnLogout');
const characterCard = document.getElementById('characterCard');

// =============================================
// 4. FUNCIONES DEL MENÚ
// =============================================

// Alternar entre login y registro
if (switchToRegisterMenu) {
    switchToRegisterMenu.addEventListener('click', () => {
        loginFormContainer.classList.remove('active');
        registerFormContainer.classList.add('active');
    });
}

if (switchToLoginMenu) {
    switchToLoginMenu.addEventListener('click', () => {
        registerFormContainer.classList.remove('active');
        loginFormContainer.classList.add('active');
    });
}

// Mostrar el gacha y ocultar el menú
function showGacha() {
    menuPrincipal.style.display = 'none';
    gachaApp.style.display = 'block';
}

// Mostrar el menú y ocultar el gacha
function showMenu() {
    menuPrincipal.style.display = 'block';
    gachaApp.style.display = 'none';
}

// =============================================
// 5. FUNCIONES DE AUTENTICACIÓN
// =============================================

function generateGuestName() {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000);
    return `Guest-${timestamp}${random}`;
}

// Login desde el menú
async function loginFromMenu() {
    const username = loginUsername.value.trim();
    const password = loginPassword.value.trim();
    
    if (!username || !password) {
        showMessage('⚠️ Completa todos los campos.');
        return;
    }
    
    try {
        // Buscar usuario por nombre
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('username', username)
            .maybeSingle();
        
        if (profileError || !profile) {
            showMessage('❌ Usuario no encontrado.');
            return;
        }
        
        // Intentar login con email (si existe)
        if (!profile.email) {
            showMessage('❌ Este usuario no tiene email asociado.');
            return;
        }
        
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: profile.email,
            password: password
        });
        
        if (authError) {
            showMessage('❌ Contraseña incorrecta.');
            return;
        }
        
        currentUser = profile;
        isGuest = false;
        updateUI();
        showMessage(`✅ ¡Bienvenido ${currentUser.username}!`);
        
        document.getElementById('authButtons').style.display = 'none';
        btnLogout.style.display = 'block';
        userBadge.style.display = 'inline-block';
        guestBadge.style.display = 'none';
        
        await loadCharacters();
        await rwCommand();
        showGacha();
        
    } catch (error) {
        console.error('Error en login:', error);
        showMessage('❌ Error al iniciar sesión.');
    }
}

// Registro desde el menú
async function registerFromMenu() {
    const username = registerUsername.value.trim();
    const email = registerEmail.value.trim();
    const password = registerPassword.value.trim();
    
    if (!username || !email || !password) {
        showMessage('⚠️ Completa todos los campos.');
        return;
    }
    
    if (password.length < 6) {
        showMessage('⚠️ La contraseña debe tener al menos 6 caracteres.');
        return;
    }
    
    try {
        // Verificar si el usuario ya existe
        const { data: existingUser } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('username', username)
            .maybeSingle();
        
        if (existingUser) {
            showMessage('❌ El nombre de usuario ya está en uso.');
            return;
        }
        
        // Crear usuario en auth
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
            showMessage('❌ Error al registrar: ' + authError.message);
            return;
        }
        
        // Crear perfil
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
        
        if (profileError) {
            showMessage('❌ Error al crear perfil.');
            return;
        }
        
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
        
        await loadCharacters();
        await rwCommand();
        showGacha();
        
    } catch (error) {
        console.error('Error en registro:', error);
        showMessage('❌ Error al registrar usuario.');
    }
}

// Login como invitado
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
        showGacha();
        
    } catch (error) {
        console.error('Error en login guest:', error);
        showMessage('❌ Error al crear invitado: ' + (error.message || 'Intenta de nuevo'));
    }
}

// Cerrar sesión
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
        showMenu();
        
    } catch (error) {
        console.error('Error en logout:', error);
        showMessage('❌ Error al cerrar sesión');
    }
}

// =============================================
// 6. FUNCIONES DEL GACHA
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

async function getRandomCharacter() {
    try {
        if (!charactersCount || charactersCount === 0) {
            const { count, error } = await supabaseClient
                .from('characters')
                .select('*', { count: 'exact', head: true });
            
            if (error) throw error;
            charactersCount = count;
        }

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

async function rwCommand() {
    if (!currentUser) {
        showMessage('⚠️ Inicia sesión o juega como invitado primero.');
        return;
    }

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

async function claimCommand() {
    if (!currentUser) {
        showMessage('⚠️ Inicia sesión o juega como invitado primero.');
        return;
    }
    
    if (!currentCharacter) {
        showMessage('⚠️ Usa #rw primero para ver un personaje.');
        return;
    }

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
        
        // Verificar si alguien más ya lo reclamó
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
// 9. INICIALIZACIÓN
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
                showGacha();
                return;
            }
        }
    } catch (error) {
        console.log('No hay sesión activa');
    }
    
    showMenu();
    showMessage('🎮 ¡Bienvenido! Inicia sesión o juega como invitado.');
}

// =============================================
// 10. EVENT LISTENERS
// =============================================

// Menú
if (btnLoginMenu) btnLoginMenu.addEventListener('click', loginFromMenu);
if (btnRegisterMenu) btnRegisterMenu.addEventListener('click', registerFromMenu);
if (btnGuestMenu) btnGuestMenu.addEventListener('click', loginAsGuest);

// Enter para login/registro
if (loginPassword) {
    loginPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginFromMenu();
    });
}
if (registerPassword) {
    registerPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') registerFromMenu();
    });
}

// Gacha
btnRw.addEventListener('click', rwCommand);
btnClaim.addEventListener('click', claimCommand);
btnLogout.addEventListener('click', logout);

// Tecla I para inventario
document.addEventListener('keydown', (e) => {
    if (e.key === 'i' || e.key === 'I') {
        showInventory();
    }
});

// =============================================
// 11. INICIAR
// =============================================
init();

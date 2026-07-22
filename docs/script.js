// =============================================
// 1. CONFIGURACIÓN DE SUPABASE
// =============================================
const supabaseUrl = 'https://yzhtvjkjnftijzaztzqs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6aHR2amtqbmZ0aWp6YXp0enFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NjIyMzMsImV4cCI6MjEwMDIzODIzM30.HQGkaabDSjUiK-9JxczPY7R72zr8nEdTK32Pk6PMkDM';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// =============================================
// 2. ESTADO DE LA APLICACIÓN
// =============================================
let currentUser = null; // Usuario autenticado
let currentCharacter = null;
let allCharacters = [];
let lastRwTime = 0;
let lastClaimTime = 0;
let isGuest = false;
let guestCounter = 0;

// =============================================
// 3. ELEMENTOS DEL DOM
// =============================================
const charImage = document.getElementById('char-image');
const charName = document.getElementById('char-name');
const charRarity = document.getElementById('char-rarity');
const charValue = document.getElementById('char-value');
const userCoinsSpan = document.getElementById('user-coins');
const displayUsername = document.getElementById('displayUsername');
const btnRw = document.getElementById('btn-rw');
const btnClaim = document.getElementById('btn-claim');
const messageP = document.getElementById('message');
const btnGuest = document.getElementById('btnGuest');
const btnLogin = document.getElementById('btnLogin');
const btnRegister = document.getElementById('btnRegister');
const btnLogout = document.getElementById('btnLogout');

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
// 4. FUNCIONES DE AUTENTICACIÓN
// =============================================

// Generar nombre de invitado
function generateGuestName() {
    guestCounter = parseInt(localStorage.getItem('guestCounter') || '0') + 1;
    localStorage.setItem('guestCounter', guestCounter.toString());
    return `Guest-${guestCounter}`;
}

// Login como invitado
async function loginAsGuest() {
    try {
        const username = generateGuestName();
        
        // Verificar si el nombre de guest ya existe
        const { data: existing } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('username', username)
            .maybeSingle();
        
        if (existing) {
            // Si existe, generar otro
            return await loginAsGuest();
        }
        
        // Crear usuario guest en la base de datos
        const { data, error } = await supabaseClient
            .from('profiles')
            .insert({
                username: username,
                is_guest: true,
                coins: 50 // Monedas iniciales para invitados
            })
            .select()
            .single();
        
        if (error) throw error;
        
        currentUser = data;
        isGuest = true;
        
        // Crear cooldowns para el nuevo usuario
        await supabaseClient
            .from('cooldowns')
            .insert({ user_id: currentUser.id });
        
        updateUI();
        showMessage(`🎮 ¡Bienvenido ${currentUser.username}! (Invitado)`);
        await loadCharacters();
        await rwCommand();
        
        // Ocultar botones de autenticación
        document.getElementById('authButtons').style.display = 'none';
        btnLogout.style.display = 'block';
        
    } catch (error) {
        console.error('Error en login guest:', error);
        showMessage('❌ Error al crear invitado. Intenta de nuevo.');
    }
}

// Login con email y contraseña
async function loginWithEmail(email, password) {
    try {
        // Primero, autenticar con Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (authError) throw authError;
        
        // Obtener perfil del usuario
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .single();
        
        if (profileError) {
            // Si no tiene perfil, crearlo
            const { data: newProfile, error: createError } = await supabaseClient
                .from('profiles')
                .insert({
                    id: authData.user.id,
                    username: email.split('@')[0] + '_' + Math.floor(Math.random() * 1000),
                    email: email,
                    coins: 100
                })
                .select()
                .single();
            
            if (createError) throw createError;
            currentUser = newProfile;
        } else {
            currentUser = profile;
        }
        
        isGuest = false;
        
        // Verificar cooldowns
        const { data: cooldownData } = await supabaseClient
            .from('cooldowns')
            .select('*')
            .eq('user_id', currentUser.id)
            .single();
        
        if (!cooldownData) {
            await supabaseClient
                .from('cooldowns')
                .insert({ user_id: currentUser.id });
        }
        
        updateUI();
        showMessage(`✅ ¡Bienvenido ${currentUser.username}!`);
        await loadCharacters();
        await rwCommand();
        
        // Ocultar botones de autenticación
        document.getElementById('authButtons').style.display = 'none';
        btnLogout.style.display = 'block';
        
        // Cerrar modal
        loginModal.classList.remove('active');
        loginError.textContent = '';
        
    } catch (error) {
        console.error('Error en login:', error);
        loginError.textContent = '❌ ' + (error.message || 'Error al iniciar sesión');
    }
}

// Registro de nuevo usuario
async function registerUser(username, email, password) {
    try {
        // Verificar si el username ya existe
        const { data: existingUser } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('username', username)
            .maybeSingle();
        
        if (existingUser) {
            registerError.textContent = '❌ El nombre de usuario ya está en uso';
            return;
        }
        
        // Verificar si el email ya existe
        const { data: existingEmail } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        
        if (existingEmail) {
            registerError.textContent = '❌ El correo electrónico ya está registrado';
            return;
        }
        
        // Crear usuario en Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password
        });
        
        if (authError) throw authError;
        
        if (!authData.user) {
            throw new Error('No se pudo crear el usuario');
        }
        
        // Crear perfil
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .insert({
                id: authData.user.id,
                username: username,
                email: email,
                coins: 100
            })
            .select()
            .single();
        
        if (profileError) throw profileError;
        
        currentUser = profile;
        isGuest = false;
        
        // Crear cooldowns
        await supabaseClient
            .from('cooldowns')
            .insert({ user_id: currentUser.id });
        
        updateUI();
        showMessage(`✅ ¡Cuenta creada! Bienvenido ${currentUser.username}`);
        await loadCharacters();
        await rwCommand();
        
        // Ocultar botones de autenticación
        document.getElementById('authButtons').style.display = 'none';
        btnLogout.style.display = 'block';
        
        // Cerrar modal
        registerModal.classList.remove('active');
        registerError.textContent = '';
        
    } catch (error) {
        console.error('Error en registro:', error);
        registerError.textContent = '❌ ' + (error.message || 'Error al registrar usuario');
    }
}

// Cerrar sesión
async function logout() {
    try {
        // Si es guest, no hacemos auth logout
        if (!isGuest) {
            await supabaseClient.auth.signOut();
        }
        
        currentUser = null;
        isGuest = false;
        currentCharacter = null;
        allCharacters = [];
        
        // Resetear UI
        displayUsername.textContent = 'Invitado';
        userCoinsSpan.textContent = '0';
        charName.textContent = '???';
        charRarity.textContent = '⭐ Esperando...';
        charValue.textContent = '🪙 0 monedas';
        charImage.style.display = 'none';
        btnClaim.disabled = true;
        
        // Mostrar botones de autenticación
        document.getElementById('authButtons').style.display = 'flex';
        btnLogout.style.display = 'none';
        
        showMessage('👋 Sesión cerrada. ¡Vuelve pronto!');
        
    } catch (error) {
        console.error('Error en logout:', error);
        showMessage('❌ Error al cerrar sesión');
    }
}

// =============================================
// 5. FUNCIONES DEL GACHA
// =============================================

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

function getRandomCharacter() {
    if (allCharacters.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * allCharacters.length);
    return allCharacters[randomIndex];
}

async function rwCommand() {
    if (!currentUser) {
        showMessage('⚠️ Inicia sesión o juega como invitado primero.');
        return;
    }

    const now = Date.now();
    if (now - lastRwTime < 60000) {
        const remaining = Math.ceil((60000 - (now - lastRwTime)) / 1000);
        showMessage(`⏳ Espera ${remaining} segundos para usar #rw.`);
        return;
    }

    try {
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

        // Actualizar cooldown en DB (solo si no es guest)
        if (!isGuest && currentUser) {
            await supabaseClient
                .from('cooldowns')
                .upsert({ 
                    user_id: currentUser.id, 
                    last_rw: new Date().toISOString() 
                });
        }

    } catch (error) {
        console.error('Error en #rw:', error);
        showMessage('❌ Error al obtener personaje: ' + error.message);
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
    if (now - lastClaimTime < 300000) {
        const remaining = Math.ceil((300000 - (now - lastClaimTime)) / 1000);
        showMessage(`⏳ Espera ${remaining} segundos para reclamar.`);
        return;
    }

    try {
        // Si es guest, no guardar en DB, solo simular
        if (isGuest) {
            showMessage(`🎮 [MODO GUEST] Reclamaste a ${currentCharacter.name}! +${currentCharacter.value || 0} monedas (no se guarda)`);
            lastClaimTime = now;
            setTimeout(() => rwCommand(), 1000);
            return;
        }

        // Usuario registrado: guardar en DB
        const { data: existing, error: checkError } = await supabaseClient
            .from('inventory')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('character_id', currentCharacter.id)
            .maybeSingle();

        if (checkError) throw checkError;
        
        if (existing) {
            showMessage('⚠️ Ya tienes este personaje.');
            await rwCommand();
            return;
        }

        // Añadir al inventario
        const { error: insertError } = await supabaseClient
            .from('inventory')
            .insert({
                user_id: currentUser.id,
                character_id: currentCharacter.id
            });

        if (insertError) throw insertError;

        // Actualizar monedas
        const coinsToAdd = currentCharacter.value || 0;
        const newCoins = (currentUser.coins || 0) + coinsToAdd;
        
        const { error: updateError } = await supabaseClient
            .from('profiles')
            .update({ coins: newCoins })
            .eq('id', currentUser.id);

        if (updateError) throw updateError;

        currentUser.coins = newCoins;
        updateUI();
        showMessage(`✅ ¡Reclamaste a ${currentCharacter.name}! +${coinsToAdd} monedas.`);
        lastClaimTime = now;

        // Actualizar cooldown
        await supabaseClient
            .from('cooldowns')
            .upsert({ 
                user_id: currentUser.id, 
                last_claim: new Date().toISOString() 
            });

        setTimeout(() => rwCommand(), 1000);

    } catch (error) {
        console.error('Error en #claim:', error);
        showMessage('❌ Error al reclamar personaje.');
    }
}

// =============================================
// 6. FUNCIONES DE UI
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
// 7. FUNCIONES DE INVENTARIO
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
        const { data, error } = await supabaseClient
            .from('inventory')
            .select(`
                character_id,
                characters (
                    name,
                    rarity,
                    value
                )
            `)
            .eq('user_id', currentUser.id);

        if (error) throw error;

        if (!data || data.length === 0) {
            showMessage('📭 No tienes personajes aún. ¡Usa #rw!');
            return;
        }

        const names = data.map(item => item.characters.name).join(', ');
        showMessage(`📦 Tus personajes (${data.length}): ${names}`);
        console.log('📦 Inventario completo:', data);
    } catch (error) {
        console.error('Error mostrando inventario:', error);
        showMessage('❌ Error al mostrar inventario');
    }
}

// =============================================
// 8. INICIALIZACIÓN
// =============================================
async function init() {
    // Verificar si hay sesión activa
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        // Usuario autenticado
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
        
        if (profile) {
            currentUser = profile;
            isGuest = false;
            document.getElementById('authButtons').style.display = 'none';
            btnLogout.style.display = 'block';
            updateUI();
            showMessage(`✅ Bienvenido de nuevo ${currentUser.username}`);
            await loadCharacters();
            await rwCommand();
            return;
        }
    }

    // Si no hay sesión, mostrar botones de autenticación
    showMessage('🎮 ¡Bienvenido! Inicia sesión o juega como invitado.');
}

// =============================================
// 9. EVENT LISTENERS
// =============================================

// Botones principales
btnRw.addEventListener('click', rwCommand);
btnClaim.addEventListener('click', claimCommand);

// Autenticación
btnGuest.addEventListener('click', loginAsGuest);
btnLogout.addEventListener('click', logout);

// Mostrar modales
btnLogin.addEventListener('click', () => {
    loginModal.classList.add('active');
    loginError.textContent = '';
});

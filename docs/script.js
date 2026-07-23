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
let charactersByRarity = {}; // Caché organizado por rareza
let lastRwTime = 0;
let lastClaimTime = 0;
let isGuest = false;

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
        charactersByRarity = {};
        
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
// 6. FUNCIONES DEL GACHA (CON SISTEMA DE RAREZAS)
// =============================================

async function loadCharacters() {
    try {
        // Cargar todos los personajes y agruparlos por rareza
        const { data, error } = await supabaseClient
            .from('characters')
            .select('*');
        
        if (error) {
            console.error('Error cargando personajes:', error);
            // Usar personajes de ejemplo en caso de error
            charactersByRarity = getExampleCharactersByRarity();
            showMessage('📝 Usando personajes de ejemplo (error de conexión)');
            return true;
        }
        
        if (data && data.length > 0) {
            // Agrupar por rareza
            charactersByRarity = {};
            data.forEach(char => {
                const rarity = char.rarity || 'Comun';
                if (!charactersByRarity[rarity]) {
                    charactersByRarity[rarity] = [];
                }
                charactersByRarity[rarity].push(char);
            });
            
            const total = data.length;
            console.log(`✅ ${total} personajes cargados y agrupados por rareza`);
            console.log('📊 Distribución:', Object.keys(charactersByRarity).map(r => `${r}: ${charactersByRarity[r].length}`).join(', '));
            showMessage(`🎮 ${total} personajes disponibles`);
            return true;
        } else {
            // Si la tabla está vacía, usar ejemplos
            charactersByRarity = getExampleCharactersByRarity();
            showMessage('📝 Usando personajes de ejemplo (tabla vacía)');
            return true;
        }
        
    } catch (error) {
        console.error('Error en loadCharacters:', error);
        charactersByRarity = getExampleCharactersByRarity();
        showMessage('📝 Usando personajes de ejemplo (error)');
        return true;
    }
}

function getExampleCharactersByRarity() {
    return {
        'Mitico': [
            { mal_id: 4, name: 'Mewtwo', rarity: 'Mitico', value: 2000, image_jpg_url: '' },
            { mal_id: 6, name: 'Goku', rarity: 'Mitico', value: 2500, image_jpg_url: '' }
        ],
        'Legendario': [
            { mal_id: 1, name: 'Pikachu', rarity: 'Legendario', value: 1000, image_jpg_url: '' },
            { mal_id: 7, name: 'Naruto', rarity: 'Legendario', value: 1200, image_jpg_url: '' }
        ],
        'Epico': [
            { mal_id: 2, name: 'Charizard', rarity: 'Epico', value: 500, image_jpg_url: '' },
            { mal_id: 8, name: 'Luffy', rarity: 'Epico', value: 450, image_jpg_url: '' }
        ],
        'Raro': [
            { mal_id: 5, name: 'Eevee', rarity: 'Raro', value: 300, image_jpg_url: '' },
            { mal_id: 9, name: 'Tanjiro', rarity: 'Raro', value: 300, image_jpg_url: '' }
        ],
        'Poco Comun': [
            { mal_id: 10, name: 'Gojo', rarity: 'Poco Comun', value: 200, image_jpg_url: '' }
        ],
        'Comun': [
            { mal_id: 3, name: 'Bulbasaur', rarity: 'Comun', value: 100, image_jpg_url: '' },
            { mal_id: 11, name: 'Kirito', rarity: 'Comun', value: 100, image_jpg_url: '' }
        ]
    };
}

function getRandomCharacterFromCache() {
    // 1. Definir las probabilidades de cada rareza
    const rarityProbability = {
        'Mitico': 0.01,      // 1%
        'Exotico': 0.02,     // 2%
        'Legendario': 0.05,  // 5%
        'Epico': 0.12,       // 12%
        'Raro': 0.20,        // 20%
        'Poco Comun': 0.25,  // 25%
        'Comun': 0.35        // 35%
    };

    // 2. Seleccionar una rareza según las probabilidades
    const rand = Math.random();
    let cumulative = 0;
    let selectedRarity = 'Comun';

    for (const [rarity, prob] of Object.entries(rarityProbability)) {
        cumulative += prob;
        if (rand <= cumulative) {
            selectedRarity = rarity;
            break;
        }
    }

    // 3. Obtener un personaje aleatorio de esa rareza
    const characters = charactersByRarity[selectedRarity] || [];
    if (characters.length === 0) {
        // Fallback: si no hay personajes de esa rareza, obtener de cualquier rareza
        const allCharacters = Object.values(charactersByRarity).flat();
        if (allCharacters.length === 0) return null;
        return allCharacters[Math.floor(Math.random() * allCharacters.length)];
    }
    
    return characters[Math.floor(Math.random() * characters.length)];
}

// ⚡ rwCommand: SIN COOLDOWN (optimizado)
async function rwCommand() {
    if (!currentUser) {
        showMessage('⚠️ Inicia sesión o juega como invitado primero.');
        return;
    }

    try {
        const character = getRandomCharacterFromCache();
        
        if (!character) {
            showMessage('❌ No hay personajes disponibles.');
            return;
        }

        currentCharacter = character;
        displayCharacter(currentCharacter);
        btnClaim.disabled = false;
        characterCard.classList.add('has-character');
        showMessage('✨ ¡Personaje disponible! Usa #claim para reclamarlo.');

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

// ⚡ claimCommand: COOLDOWN DE 30 SEGUNDOS (CORREGIDO)
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
    if (now - lastClaimTime < 30000) {  // 30 segundos
        const remaining = Math.ceil((30000 - (now - lastClaimTime)) / 1000);
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
        
        const { data: existing, error: checkError } = await supabaseClient
            .from('inventory')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('character_id', characterId)
            .maybeSingle();

        if (checkError) {
            console.error('Error verificando inventario:', checkError);
        }
        
        if (existing) {
            showMessage('⚠️ Ya tienes este personaje.');
            await rwCommand();
            return;
        }

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
        const { data, error } = await supabaseClient
            .from('inventory')
            .select(`
                character_id,
                characters!inner (
                    name,
                    rarity,
                    value
                )
            `)
            .eq('user_id', currentUser.id);

        if (error) {
            console.error('Error consultando inventario:', error);
            showMessage('❌ Error al mostrar inventario');
            return;
        }

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
                return;
            }
        }
    } catch (error) {
        console.log('No hay sesión activa');
    }
    
    showMessage('🎮 ¡Bienvenido! Inicia sesión o juega como invitado.');
}

// =============================================
// 10. EVENT LISTENERS
// =============================================

btnRw.addEventListener('click', rwCommand);
btnClaim.addEventListener('click', claimCommand);
btnGuest.addEventListener('click', loginAsGuest);
btnLogout.addEventListener('click', logout);

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
// 11. INICIAR
// =============================================
init();
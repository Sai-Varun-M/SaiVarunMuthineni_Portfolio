import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const typingBoneNames = [
    "thighL", "thighR", "shinL", "shinR", "forearmL", "forearmR",
    "handL", "handR", "f_pinky03R", "f_pinky02L", "f_pinky02R",
    "f_pinky01L", "f_pinky01R", "palm04L", "palm04R", "f_ring01L",
    "thumb01L", "thumb01R", "thumb03L", "thumb03R", "palm02L",
    "palm02R", "palm01L", "palm01R", "f_index01L", "f_index01R",
    "palm03L", "palm03R", "f_ring02L", "f_ring02R", "f_ring01R",
    "f_ring03L", "f_ring03R", "f_middle01L", "f_middle02L",
    "f_middle03L", "f_middle01R", "f_middle02R", "f_middle03R",
    "f_index02L", "f_index03L", "f_index02R", "f_index03R",
    "thumb02L", "f_pinky03L", "upper_armL", "upper_armR",
    "thumb02R", "toeL", "heel02L", "toeR", "heel02R"
];
const eyebrowBoneNames = ["eyebrow_L", "eyebrow_R"];

// ── Encryption helpers ──
async function generateAESKey(password) {
    const passwordBuffer = new TextEncoder().encode(password);
    const hashedPassword = await crypto.subtle.digest("SHA-256", passwordBuffer);
    return crypto.subtle.importKey(
        "raw",
        hashedPassword.slice(0, 32),
        { name: "AES-CBC" },
        false,
        ["encrypt", "decrypt"]
    );
}

async function decryptFile(url, password) {
    const response = await fetch(url);
    const encryptedData = await response.arrayBuffer();
    const iv = new Uint8Array(encryptedData.slice(0, 16));
    const data = encryptedData.slice(16);
    const key = await generateAESKey(password);
    return crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, data);
}

// ── Promisified loaders ──
function loadHDR(path, filename) {
    return new Promise((resolve, reject) => {
        new RGBELoader()
            .setPath(path)
            .load(filename, resolve, undefined, reject);
    });
}

function loadGLTF(loader, url) {
    return new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
    });
}

// ── Main init ──
function init3D() {
    const container = document.getElementById('character-canvas-container');
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const aspect = width / height;
    const isMobile = window.innerWidth <= 768 || window.devicePixelRatio > 2;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(14.5, aspect, 0.1, 1000);
    camera.position.set(0, 13.1, 40);

    const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !isMobile, // Disable anti-aliasing on mobile for performance
        powerPreference: "high-performance",
        precision: "mediump"
    });
    renderer.setSize(width, height);
    // Limit pixel ratio to max 1.5 to save GPU overhead on high DPI screens
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = isMobile ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Start hidden — will fade in once model is ready
    renderer.domElement.style.opacity = '0';

    // Lighting
    const directionalLight = new THREE.DirectionalLight(0xc7a9ff, 0);
    directionalLight.position.set(-2, 5, 2);
    directionalLight.castShadow = true;
    const shadowSize = isMobile ? 1024 : 2048;
    directionalLight.shadow.mapSize.width = shadowSize;
    directionalLight.shadow.mapSize.height = shadowSize;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 15;
    directionalLight.shadow.bias = -0.001;
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0xc2a4ff, 0, 100, 3);
    pointLight.position.set(3, 12, 4);
    scene.add(pointLight);

    let mixer, headBone, neckBone, spineBone, leftEye, rightEye, screenLight, loadedCharacter;
    let mouse = { x: 0, y: 0 }, targetRotation = { x: 0, y: 0 }, currentRotation = { x: 0, y: 0 };
    const clock = new THREE.Clock();

    // ── IntersectionObserver: pause rendering when canvas is offscreen ──
    let isCanvasVisible = true;
    const canvasObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            isCanvasVisible = entry.isIntersecting;
        });
    }, { threshold: 0.01 });
    canvasObserver.observe(container);

    // Setup loaders
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('./assets/draco/');
    dracoLoader.preload(); // Pre-initialize the Draco WASM decoder
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    // ── PARALLEL LOADING: HDR environment + encrypted model at the same time ──
    Promise.all([
        decryptFile('./assets/models/character.enc', 'Character3D#@'),
        loadHDR('./assets/models/', 'char_enviorment.hdr')
    ]).then(([decryptedData, hdrTexture]) => {
        // Apply HDR environment immediately
        hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = hdrTexture;
        scene.environmentIntensity = 0;
        scene.environmentRotation.set(5.76, 85.85, 1);

        // Load the decrypted GLTF model
        const blobUrl = URL.createObjectURL(new Blob([decryptedData]));
        return loadGLTF(loader, blobUrl);
    }).then((gltf) => {
        loadedCharacter = gltf.scene;
        scene.add(loadedCharacter);

        loadedCharacter.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
                // NOTE: Do NOT set matrixAutoUpdate = false on animated meshes —
                // the AnimationMixer needs to update their matrices every frame.

                if (node.material) {
                    if (node.material.roughness !== undefined) {
                        node.material.roughness = Math.max(0.2, node.material.roughness * 0.9);
                    }

                    const mName = node.material.name ? node.material.name.toLowerCase() : '';
                    const nName = node.name ? node.name.toLowerCase() : '';

                    // Top (Shirt/Jacket)
                    if (mName.includes('top') || mName.includes('shirt') || mName.includes('jacket') || nName.includes('top') || nName.includes('shirt')) {
                        node.material.color.setHex(0x1e293b);
                        node.material.roughness = 0.8;
                    }

                    // Bottom (Pants)
                    if (mName.includes('bottom') || mName.includes('pant') || nName.includes('bottom') || nName.includes('pant')) {
                        node.material.color.setHex(0x0f172a);
                        node.material.roughness = 0.9;
                    }

                    // Shoes
                    if (mName.includes('shoe') || mName.includes('footwear') || nName.includes('shoe') || nName.includes('footwear')) {
                        node.material.color.setHex(0xf8fafc);
                        node.material.roughness = 0.4;
                        node.material.metalness = 0.1;
                    }

                    // Glasses
                    if (mName.includes('glasses') || nName.includes('glasses')) {
                        node.material.color.setHex(0x000000);
                        node.material.metalness = 0.9;
                        node.material.roughness = 0.1;
                    }

                    // Freeze material uniforms — no more changes needed after setup
                    node.material.needsUpdate = false;
                }
            }
        });

        const footR = loadedCharacter.getObjectByName("footR");
        const footL = loadedCharacter.getObjectByName("footL");
        if (footR) footR.position.y = 3.36;
        if (footL) footL.position.y = 3.36;

        headBone = loadedCharacter.getObjectByName("spine006");
        neckBone = loadedCharacter.getObjectByName("spine005");
        spineBone = loadedCharacter.getObjectByName("spine004");
        leftEye = loadedCharacter.getObjectByName("eyeL");
        rightEye = loadedCharacter.getObjectByName("eyeR");

        screenLight = loadedCharacter.getObjectByName("screenlight");

        mixer = new THREE.AnimationMixer(loadedCharacter);

        // Setup animations
        const filterAnimationTracks = (clip, boneNames) => {
            const filteredTracks = clip.tracks.filter((track) =>
                boneNames.some((boneName) => track.name.includes(boneName))
            );
            return new THREE.AnimationClip(clip.name + "_filtered", clip.duration, filteredTracks);
        };

        if (gltf.animations.length > 0) {
            const introClip = THREE.AnimationClip.findByName(gltf.animations, "introAnimation");
            if (introClip) {
                mixer.clipAction(introClip).setLoop(THREE.LoopOnce, 1).play();
            }

            ["key1", "key2", "key5", "key6"].forEach(name => {
                const clip = THREE.AnimationClip.findByName(gltf.animations, name);
                if (clip) {
                    const action = mixer.clipAction(clip);
                    action.play();
                    action.timeScale = 1.8;
                }
            });

            const typingClip = THREE.AnimationClip.findByName(gltf.animations, "typing");
            if (typingClip) {
                const typingAction = mixer.clipAction(filterAnimationTracks(typingClip, typingBoneNames));
                typingAction.play();
                typingAction.timeScale = 1.6;
            }

            // Fast fade-in reveal — the model is ready!
            gsap.to(renderer.domElement, { opacity: 1, duration: 0.8, ease: "power2.out" });

            // Reduced delay: blink + lighting fade-in after 500ms (was 1500ms)
            setTimeout(() => {
                const blinkClip = THREE.AnimationClip.findByName(gltf.animations, "Blink");
                if (blinkClip) mixer.clipAction(blinkClip).play().fadeIn(0.5);

                gsap.to(scene, { environmentIntensity: 0.64, duration: 1.5, ease: "power2.inOut" });
                gsap.to(directionalLight, { intensity: 1.5, duration: 1.5, ease: "power2.inOut" });
            }, 500);
        }

        // Defer scroll animation setup to idle time so it doesn't block first paint
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => setupScrollAnimations(loadedCharacter, camera, screenLight, directionalLight));
        } else {
            setTimeout(() => setupScrollAnimations(loadedCharacter, camera, screenLight, directionalLight), 100);
        }

    }).catch(console.error);

    // ── Raycaster for head avoidance (throttled) ──
    const raycaster = new THREE.Raycaster();
    const mouseVector = new THREE.Vector2();
    let raycastFrame = 0;
    let cachedHeadDistance = 999;

    window.addEventListener('mousemove', (e) => {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        mouseVector.x = mouse.x;
        mouseVector.y = mouse.y;
    });

    window.addEventListener('resize', () => {
        if (!container) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    // Variables for avoidance smoothing
    let avoidanceX = 0;
    let avoidanceY = 0;

    function animate() {
        requestAnimationFrame(animate);

        // Skip rendering entirely when the canvas is offscreen
        if (!isCanvasVisible) return;

        const delta = clock.getDelta();
        if (mixer) mixer.update(delta);

        // Throttle raycasting to every 3rd frame (~20 fps at 60fps)
        raycastFrame++;
        if (raycastFrame >= 3) {
            raycastFrame = 0;
            raycaster.setFromCamera(mouseVector, camera);
            cachedHeadDistance = 999;

            if (loadedCharacter) {
                const intersects = raycaster.intersectObject(loadedCharacter, true);
                if (intersects.length > 0) {
                    const hitName = intersects[0].object.name.toLowerCase();
                    if (hitName.includes('head') || hitName.includes('face') || hitName.includes('hair') || hitName.includes('glasses') || hitName.includes('eye')) {
                        cachedHeadDistance = intersects[0].distance;
                    } else if (intersects[0].point.y > 10) {
                        cachedHeadDistance = intersects[0].distance;
                    }
                }
            }
        }

        // Calculate avoidance force using cached distance
        let targetAvoidanceX = 0;
        let targetAvoidanceY = 0;

        if (cachedHeadDistance < 35) {
            const force = Math.max(0, (35 - cachedHeadDistance) / 10);
            targetAvoidanceX = -mouse.x * force * 1.5;
            targetAvoidanceY = -mouse.y * force * 1.5;
        }

        // Smoothly interpolate current rotations
        currentRotation.x = THREE.MathUtils.lerp(currentRotation.x, mouse.x, 3.5 * delta);
        currentRotation.y = THREE.MathUtils.lerp(currentRotation.y, mouse.y, 3.5 * delta);

        // Smoothly interpolate avoidance
        avoidanceX = THREE.MathUtils.lerp(avoidanceX, targetAvoidanceX, 5.0 * delta);
        avoidanceY = THREE.MathUtils.lerp(avoidanceY, targetAvoidanceY, 5.0 * delta);

        if (headBone && neckBone && spineBone) {
            headBone.rotation.y = (-currentRotation.x * 0.4) + avoidanceX;
            headBone.rotation.x = (currentRotation.y * 0.4) + avoidanceY;

            neckBone.rotation.y = (-currentRotation.x * 0.2) + (avoidanceX * 0.5);
            neckBone.rotation.x = (currentRotation.y * 0.2) + (avoidanceY * 0.5);

            spineBone.rotation.y = -currentRotation.x * 0.1;
            spineBone.rotation.x = currentRotation.y * 0.1;
        }

        if (leftEye && rightEye) {
            leftEye.rotation.y = (-currentRotation.x * 0.3) + (avoidanceX * 0.2);
            leftEye.rotation.x = (currentRotation.y * 0.3) + (avoidanceY * 0.2);
            rightEye.rotation.y = (-currentRotation.x * 0.3) + (avoidanceX * 0.2);
            rightEye.rotation.x = (currentRotation.y * 0.3) + (avoidanceY * 0.2);
        }

        if (screenLight && screenLight.material && screenLight.material.opacity > 0.9) {
            pointLight.intensity = screenLight.material.emissiveIntensity * 20;
        } else {
            pointLight.intensity = 0;
        }

        renderer.render(scene, camera);
    }
    animate();
}

function setupScrollAnimations(character, camera, screenLight, light) {
    let intensity = 0;
    setInterval(() => { intensity = Math.random(); }, 200);

    let monitor;
    character.children.forEach((object) => {
        if (object.name === "Plane004") {
            object.children.forEach((child) => {
                child.material.transparent = true;
                child.material.opacity = 0;
                if (child.material.name === "Material.027") {
                    monitor = child;
                    child.material.color.set("#FFFFFF");
                }
            });
        }
        if (object.name === "screenlight") {
            object.material.transparent = true;
            object.material.opacity = 0;
            object.material.emissive.set("#C8BFFF");
            gsap.timeline({ repeat: -1, repeatRefresh: true }).to(object.material, {
                emissiveIntensity: () => intensity * 8,
                duration: () => Math.random() * 0.6,
                delay: () => Math.random() * 0.1,
            });
            screenLight = object;
        }
    });

    let neckBone = character.getObjectByName("spine005");

    if (window.innerWidth > 1024) {
        const tl1 = gsap.timeline({
            scrollTrigger: {
                trigger: "#home",
                start: "top top",
                end: "bottom top",
                scrub: true,
            },
        });

        const tl2 = gsap.timeline({
            scrollTrigger: {
                trigger: "#about",
                start: "top center",
                end: "bottom top",
                scrub: true,
            },
        });

        const tl3 = gsap.timeline({
            scrollTrigger: {
                trigger: "#projects",
                start: "top center",
                end: "bottom top",
                scrub: true,
            },
        });

        tl1
            .fromTo(character.rotation, { y: 0 }, { y: 0.7, duration: 1 }, 0)
            .to(camera.position, { z: 40 }, 0);

        tl2
            .to(camera.position, { z: 65, y: 8.4, duration: 6, delay: 2, ease: "power3.inOut" }, 0)
            .to(character.rotation, { y: 0.92, x: 0.12, delay: 3, duration: 3 }, 0)
            .to(light, { intensity: 0.05, duration: 4, delay: 2, ease: "power2.inOut" }, 0)
            .to(character.parent, { environmentIntensity: 0.05, duration: 4, delay: 2, ease: "power2.inOut" }, 0);

        if (neckBone) tl2.to(neckBone.rotation, { x: 0.6, delay: 2, duration: 3 }, 0);
        if (monitor) tl2.to(monitor.material, { opacity: 1, duration: 0.8, delay: 3.2 }, 0);
        if (screenLight) tl2.to(screenLight.material, { opacity: 1, duration: 0.8, delay: 4.5 }, 0);
        if (monitor) tl2.fromTo(monitor.position, { y: -10, z: 2 }, { y: 0, z: 0, delay: 1.5, duration: 3 }, 0);

        tl3
            .to(character.rotation, { x: -0.04, y: 0, duration: 2 }, 0)
            .to(camera.position, { z: 40, y: 13.1, duration: 4 }, 0);
    }
}

document.addEventListener('DOMContentLoaded', init3D);

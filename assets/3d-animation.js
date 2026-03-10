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

function init3D() {
    const container = document.getElementById('character-canvas-container');
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const aspect = width / height;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(14.5, aspect, 0.1, 1000);
    camera.position.set(0, 13.1, 40);

    const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        precision: "mediump"
    });
    renderer.setSize(width, height);
    // Limit pixel ratio to max 1.5 to save GPU overhead on high DPI screens
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lighting
    const directionalLight = new THREE.DirectionalLight(0xc7a9ff, 0); // Intensity set to 0 initially for fade-in
    directionalLight.position.set(-2, 5, 2); // Adjusted for better shadows
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 15;
    directionalLight.shadow.bias = -0.001;
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0xc2a4ff, 0, 100, 3);
    pointLight.position.set(3, 12, 4);
    scene.add(pointLight);

    new RGBELoader()
        .setPath('./assets/models/')
        .load('char_enviorment.hdr', function (texture) {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            scene.environment = texture;
            scene.environmentIntensity = 0;
            scene.environmentRotation.set(5.76, 85.85, 1);
        });

    let mixer, headBone, neckBone, spineBone, leftEye, rightEye, screenLight, loadedCharacter;
    let mouse = { x: 0, y: 0 }, targetRotation = { x: 0, y: 0 }, currentRotation = { x: 0, y: 0 };
    const clock = new THREE.Clock();

    // Load Model
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('./assets/draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    decryptFile('./assets/models/character.enc', 'Character3D#@').then((decryptedData) => {
        const blobUrl = URL.createObjectURL(new Blob([decryptedData]));
        loader.load(blobUrl, (gltf) => {
            loadedCharacter = gltf.scene;
            scene.add(loadedCharacter);

            loadedCharacter.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                    // Fix: Optimize static calculations. This avoids recalculating the matrix every frame for bones that don't scale/move in the world
                    node.matrixAutoUpdate = false;
                    node.updateMatrix();

                    if (node.material) {
                        // Make materials look slightly less flat/plastic
                        if (node.material.roughness !== undefined) {
                            node.material.roughness = Math.max(0.2, node.material.roughness * 0.9);
                        }

                        // Premium Clothing Style
                        const mName = node.material.name ? node.material.name.toLowerCase() : '';
                        const nName = node.name ? node.name.toLowerCase() : '';

                        // Top (Shirt/Jacket) - sleek dark color
                        if (mName.includes('top') || mName.includes('shirt') || mName.includes('jacket') || nName.includes('top') || nName.includes('shirt')) {
                            node.material.color.setHex(0x1e293b); // Slate 800
                            node.material.roughness = 0.8;
                        }

                        // Bottom (Pants) - deep black/slate
                        if (mName.includes('bottom') || mName.includes('pant') || nName.includes('bottom') || nName.includes('pant')) {
                            node.material.color.setHex(0x0f172a); // Slate 900
                            node.material.roughness = 0.9;
                        }

                        // Shoes - crisp white to pop against the dark theme
                        if (mName.includes('shoe') || mName.includes('footwear') || nName.includes('shoe') || nName.includes('footwear')) {
                            node.material.color.setHex(0xf8fafc); // Slate 50 (Off-white)
                            node.material.roughness = 0.4;
                            node.material.metalness = 0.1;
                        }

                        // Glasses - maybe make them cool
                        if (mName.includes('glasses') || nName.includes('glasses')) {
                            node.material.color.setHex(0x000000);
                            node.material.metalness = 0.9;
                            node.material.roughness = 0.1;
                        }
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
                        // INCREASED: Keyboard press animation playback speed
                        action.timeScale = 1.8;
                    }
                });

                const typingClip = THREE.AnimationClip.findByName(gltf.animations, "typing");
                if (typingClip) {
                    const typingAction = mixer.clipAction(filterAnimationTracks(typingClip, typingBoneNames));
                    typingAction.play();
                    // INCREASED: Hand typing animation playback speed
                    typingAction.timeScale = 1.6;
                }

                // Smooth fade in of the whole scene to mask loading jitter
                renderer.domElement.style.opacity = 0;
                gsap.to(renderer.domElement, { opacity: 1, duration: 1.5, ease: "power2.inOut" });

                setTimeout(() => {
                    const blinkClip = THREE.AnimationClip.findByName(gltf.animations, "Blink");
                    if (blinkClip) mixer.clipAction(blinkClip).play().fadeIn(0.5);

                    gsap.to(scene, { environmentIntensity: 0.64, duration: 2, ease: "power2.inOut" });
                    gsap.to(directionalLight, { intensity: 1.5, duration: 2, ease: "power2.inOut" });
                }, 1500); // Reduced delay for faster lighting fade-in
            }

            setupScrollAnimations(loadedCharacter, camera, screenLight, directionalLight);

        }, undefined, console.error);
    });

    // Raycaster for head avoidance
    const raycaster = new THREE.Raycaster();
    const mouseVector = new THREE.Vector2();

    window.addEventListener('mousemove', (e) => {
        // Reduced max rotation bounds for natural tracking
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        mouseVector.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouseVector.y = -(e.clientY / window.innerHeight) * 2 + 1;
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
        const delta = clock.getDelta();
        if (mixer) mixer.update(delta);

        // Calculate Raycast to check if mouse is near head
        raycaster.setFromCamera(mouseVector, camera);
        let headDistance = 999;

        // Find distance to the specific character mesh
        if (loadedCharacter) {
            const intersects = raycaster.intersectObject(loadedCharacter, true);
            if (intersects.length > 0) {
                // Check if it's hitting the upper body/head region
                const hitName = intersects[0].object.name.toLowerCase();
                if (hitName.includes('head') || hitName.includes('face') || hitName.includes('hair') || hitName.includes('glasses') || hitName.includes('eye')) {
                    headDistance = intersects[0].distance;
                } else if (intersects[0].point.y > 10) { // Rough height check for head area
                    headDistance = intersects[0].distance;
                }
            }
        }

        // Calculate avoidance force
        let targetAvoidanceX = 0;
        let targetAvoidanceY = 0;

        // If mouse is very close to the character's screen space bounding/head (distance from camera to head is roughly 25-30)
        if (headDistance < 35) {
            // Apply exponential force based on proximity
            const force = Math.max(0, (35 - headDistance) / 10);

            // Push away from mouse
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
            // Distribute the rotation across spine, neck, and head
            // Head takes the most rotation + strong avoidance
            headBone.rotation.y = (-currentRotation.x * 0.4) + avoidanceX;
            headBone.rotation.x = (currentRotation.y * 0.4) + avoidanceY;

            // Neck takes some + some avoidance
            neckBone.rotation.y = (-currentRotation.x * 0.2) + (avoidanceX * 0.5);
            neckBone.rotation.x = (currentRotation.y * 0.2) + (avoidanceY * 0.5);

            // Spine takes a tiny bit
            spineBone.rotation.y = -currentRotation.x * 0.1;
            spineBone.rotation.x = currentRotation.y * 0.1;
        }

        if (leftEye && rightEye) {
            // Eyes track slightly more intensely towards the cursor, but less when avoiding
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
            // Day to Night transition! Dim the global main light and environment down to near 0
            // so the only thing lighting the scene is the monitor 
            .to(light, { intensity: 0.05, duration: 4, delay: 2, ease: "power2.inOut" }, 0)
            .to(character.parent, { environmentIntensity: 0.05, duration: 4, delay: 2, ease: "power2.inOut" }, 0); // scene is character.parent

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

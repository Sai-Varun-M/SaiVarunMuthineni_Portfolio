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

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    container.appendChild(renderer.domElement);

    // Lighting
    const directionalLight = new THREE.DirectionalLight(0xc7a9ff, 0);
    directionalLight.position.set(-0.47, -0.32, -1);
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

    let mixer, headBone, screenLight, loadedCharacter;
    let mouse = { x: 0, y: 0 }, interpolation = { x: 0.1, y: 0.2 };
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

            const footR = loadedCharacter.getObjectByName("footR");
            const footL = loadedCharacter.getObjectByName("footL");
            if (footR) footR.position.y = 3.36;
            if (footL) footL.position.y = 3.36;

            headBone = loadedCharacter.getObjectByName("spine006");
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
                        action.timeScale = 1.2;
                    }
                });

                const typingClip = THREE.AnimationClip.findByName(gltf.animations, "typing");
                if (typingClip) {
                    const typingAction = mixer.clipAction(filterAnimationTracks(typingClip, typingBoneNames));
                    typingAction.play();
                    typingAction.timeScale = 1.2;
                }

                setTimeout(() => {
                    const blinkClip = THREE.AnimationClip.findByName(gltf.animations, "Blink");
                    if (blinkClip) mixer.clipAction(blinkClip).play().fadeIn(0.5);

                    gsap.to(scene, { environmentIntensity: 0.64, duration: 2, ease: "power2.inOut" });
                    gsap.to(directionalLight, { intensity: 1, duration: 2, ease: "power2.inOut" });
                }, 2500);
            }

            setupScrollAnimations(loadedCharacter, camera, screenLight, directionalLight);

        }, undefined, console.error);
    });

    // Mouse interaction
    window.addEventListener('mousemove', (e) => {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    window.addEventListener('resize', () => {
        if (!container) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    function animate() {
        requestAnimationFrame(animate);
        const delta = clock.getDelta();
        if (mixer) mixer.update(delta);

        if (headBone) {
            interpolation.x = THREE.MathUtils.lerp(interpolation.x, mouse.x, 0.05);
            interpolation.y = THREE.MathUtils.lerp(interpolation.y, mouse.y, 0.05);
            headBone.rotation.y = -interpolation.x * 0.5;
            headBone.rotation.x = interpolation.y * 0.5;
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
            .to(character.rotation, { y: 0.92, x: 0.12, delay: 3, duration: 3 }, 0);

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

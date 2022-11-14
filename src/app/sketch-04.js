import { mat4, vec2, vec3, vec4 } from "gl-matrix";
import { filter, fromEvent, merge, take, throwIfEmpty } from "rxjs";
import * as twgl from "twgl.js";

import drawVert from './shader/draw.vert.glsl';
import drawFrag from './shader/draw.frag.glsl';
import integrateVert from './shader/integrate.vert.glsl';
import integrateFrag from './shader/integrate.frag.glsl';
import pressureVert from './shader/pressure.vert.glsl';
import pressureFrag from './shader/pressure.frag.glsl';
import forceVert from './shader/force.vert.glsl';
import forceFrag from './shader/force.frag.glsl';
import indicesVert from './shader/indices.vert.glsl';
import indicesFrag from './shader/indices.frag.glsl';
import sortVert from './shader/sort.vert.glsl';
import sortFrag from './shader/sort.frag.glsl';
import offsetVert from './shader/offset.vert.glsl';
import offsetFrag from './shader/offset.frag.glsl';
import heightMapVert from './shader/height-map.vert.glsl';
import heightMapFrag from './shader/height-map.frag.glsl';
import spikesVert from './shader/spikes.vert.glsl';
import spikesFrag from './shader/spikes.frag.glsl';
import testVert from './shader/test.vert.glsl';
import testFrag from './shader/test.frag.glsl';
import groundVert from './shader/ground.vert.glsl';
import groundFrag from './shader/ground.frag.glsl';
import { easeInExpo, easeInOutCubic, easeInOutExpo, easeOutQuint } from "./utils";

export class Sketch {

    TARGET_FRAME_DURATION = 16;
    #time = 0; // total time
    #deltaTime = 0; // duration betweent the previous and the current animation frame
    #frames = 0; // total framecount according to the target frame duration
    // relative frames according to the target frame duration (1 = 60 fps)
    // gets smaller with higher framerates --> use to adapt animation timing
    #deltaFrames = 0;

    // particle constants
    NUM_PARTICLES = 500;

    // spikes plane properties
    ZOOM = 1;

    // audio controlled zoom offset
    zoomOffsetMomentum = 0;
    zoomOffset = 0;
    targetZoomLerp = 0;

    // resolution of the spikes plane (side segments)
    planeResolution = 128;

    // entry animation properties
    entryDelay = 120; // frames
    entryDuration = 420; // frames
    entryProgress = 0;
    isEntryAnimationDone = false;

    simulationParams = {
        H: 1, // kernel radius
        MASS: 1, // particle mass
        REST_DENS: 1.8, // rest density
        GAS_CONST: 40, // gas constant
        VISC: 5.5, // viscosity constant

        // these are calculated from the above constants
        POLY6: 0,
        HSQ: 0,
        SPIKY_GRAD: 0,
        VISC_LAP: 0,

        PARTICLE_COUNT: 0, // TODO use instead of NUM_PARTICLES
        DOMAIN_SCALE: 0,

        STEPS: 0
    };

    pointerParams = {
        RADIUS: 1.1,
        STRENGTH: 15,
    }

    camera = {
        matrix: mat4.create(),
        near: .1,
        far: 5,
        fov: Math.PI / 4,
        aspect: 1,
        position: vec3.fromValues(0, .5, 1),
        up: vec3.fromValues(0, 1, 0),
        matrices: {
            view: mat4.create(),
            projection: mat4.create(),
            inversProjection: mat4.create(),
            inversViewProjection: mat4.create()
        }
    };

    constructor(canvasElm, audioControl, onInit = null, onEntryAnimationDone = null, isDev = false, pane = null) {
        this.canvas = canvasElm;
        this.onInit = onInit;
        this.onEntryAnimationDone = onEntryAnimationDone;
        this.isDev = isDev;
        this.pane = pane;
        this.audioControl = audioControl;

        this.#init();
    }

    run(time = 0) {
        if (this.envMapTextureLoaded) {
            this.#deltaTime = Math.min(16, time - this.#time);
            this.#time = time;
            this.#deltaFrames = this.#deltaTime / this.TARGET_FRAME_DURATION;
            this.#frames += this.#deltaFrames;

            this.#animate(this.#deltaTime);
            this.#render();
        }

        requestAnimationFrame((t) => this.run(t));
    }

    resize() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        this.viewportSize = vec2.set(
            this.viewportSize,
            this.canvas.clientWidth,
            this.canvas.clientHeight
        );

        // use a fixed domain scale for this project
        this.domainScale = vec2.fromValues(8, 8);
        this.simulationParams.DOMAIN_SCALE = this.domainScale;
        this.simulationParamsNeedUpdate = true;

        const needsResize = twgl.resizeCanvasToDisplaySize(this.canvas);

        if (needsResize) {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }

        this.#updateProjectionMatrix(gl);
    }

    #init() {
        this.gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false });

        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        twgl.addExtensionsToContext(gl);

        this.viewportSize = vec2.fromValues(
            this.canvas.clientWidth,
            this.canvas.clientHeight
        );

        this.#initEnvMap();
        this.#initTextures();

        // Setup Programs
        this.drawPrg = twgl.createProgramInfo(gl, [drawVert, drawFrag]);
        this.integratePrg = twgl.createProgramInfo(gl, [integrateVert, integrateFrag]);
        this.pressurePrg = twgl.createProgramInfo(gl, [pressureVert, pressureFrag]);
        this.forcePrg = twgl.createProgramInfo(gl, [forceVert, forceFrag]);
        this.indicesPrg = twgl.createProgramInfo(gl, [indicesVert, indicesFrag]);
        this.sortPrg = twgl.createProgramInfo(gl, [sortVert, sortFrag]);
        this.offsetPrg = twgl.createProgramInfo(gl, [offsetVert, offsetFrag]);
        this.heightMapPrg = twgl.createProgramInfo(gl, [heightMapVert, heightMapFrag]);
        this.spikesPrg = twgl.createProgramInfo(gl, [spikesVert, spikesFrag]);
        this.testPrg = twgl.createProgramInfo(gl, [testVert, testFrag]);
        this.groundPrg = twgl.createProgramInfo(gl, [groundVert, groundFrag]);

        // Setup uinform blocks
        this.simulationParamsUBO = twgl.createUniformBlockInfo(gl, this.pressurePrg, 'u_SimulationParams');
        this.pointerParamsUBO = twgl.createUniformBlockInfo(gl, this.integratePrg, 'u_PointerParams');
        this.simulationParamsNeedUpdate = true;

        // Setup Meshes
        this.quadBufferInfo = twgl.createBufferInfoFromArrays(gl, { a_position: { numComponents: 2, data: [-1, -1, 3, -1, -1, 3] }});
        this.quadVAO = twgl.createVAOAndSetAttributes(gl, this.pressurePrg.attribSetters, this.quadBufferInfo.attribs, this.quadBufferInfo.indices);
        const spikesArrays = twgl.primitives.createPlaneVertices(1, 1, this.planeResolution, this.planeResolution);
        this.spikesBufferInfo = twgl.createBufferInfoFromArrays(gl, spikesArrays);
        this.spikesVAO = twgl.createVAOAndSetAttributes(gl, this.spikesPrg.attribSetters, this.spikesBufferInfo.attribs, this.spikesBufferInfo.indices);
        this.spikesWorldMatrix = mat4.create();
        this.groundBufferInfo = twgl.primitives.createDiscBufferInfo(gl, 1.3, 8);
        this.groundVAO = twgl.createVAOAndSetAttributes(gl, this.groundPrg.attribSetters, this.groundBufferInfo.attribs, this.groundBufferInfo.indices);
        this.groundWorldMatrix = mat4.create();

        // Setup Framebuffers
        this.pressureFBO = twgl.createFramebufferInfo(gl, [{attachment: this.textures.densityPressure}], this.textureSize, this.textureSize);
        this.forceFBO = twgl.createFramebufferInfo(gl, [{attachment: this.textures.force}], this.textureSize, this.textureSize);
        this.inFBO = twgl.createFramebufferInfo(gl, [{attachment: this.textures.position1},{attachment: this.textures.velocity1}], this.textureSize, this.textureSize);
        this.outFBO = twgl.createFramebufferInfo(gl, [{attachment: this.textures.position2},{attachment: this.textures.velocity2}], this.textureSize, this.textureSize);
        this.indices1FBO = twgl.createFramebufferInfo(gl, [{attachment: this.textures.indices1}], this.textureSize, this.textureSize);
        this.indices2FBO = twgl.createFramebufferInfo(gl, [{attachment: this.textures.indices2}], this.textureSize, this.textureSize);
        this.offsetFBO = twgl.createFramebufferInfo(gl, [{attachment: this.textures.offset}], this.cellSideCount, this.cellSideCount);
        this.heightMapFBO = twgl.createFramebufferInfo(gl, [{attachment: this.textures.heightMap}], this.heightMapSize, this.heightMapSize);

        this.#initEvents();
        this.#updateSimulationParams();
        this.#initTweakpane();
        this.#updateCameraMatrix();
        this.#updateProjectionMatrix(gl);

        this.resize();
        
        if (this.onInit) this.onInit(this);
    }

    #initEvents() {
        this.isPointerDown = false;
        this.pointer = vec2.create();
        this.pointerLerp = vec2.create();
        this.pointerLerpPrev = vec2.create();
        this.pointerLerpDelta = vec2.create();

        fromEvent(this.canvas, 'pointerdown').subscribe((e) => {
            this.isPointerDown = true;
            this.pointer = this.#getNormalizedPointerCoords(e);
            this.pointer = this.#getPointerSpikesPlaneIntersection();
            vec2.copy(this.pointerLerp, this.pointer);
            vec2.copy(this.pointerLerpPrev, this.pointerLerp);
        });
        merge(
            fromEvent(this.canvas, 'pointerup'),
            fromEvent(this.canvas, 'pointerleave')
        ).subscribe(() => this.isPointerDown = false);
        fromEvent(this.canvas, 'pointermove').pipe(
            filter(() => this.isPointerDown)
        ).subscribe((e) => {
            this.pointer = this.#getNormalizedPointerCoords(e);
            this.pointer = this.#getPointerSpikesPlaneIntersection();
        });
    }

    #updateSimulationParams() {
        const sim = this.simulationParams
        sim.HSQ = sim.H * sim.H;
        sim.POLY6 = 315.0 / (64. * Math.PI * Math.pow(sim.H, 9.));
        sim.SPIKY_GRAD = -45.0 / (Math.PI * Math.pow(sim.H, 6.));
        sim.VISC_LAP = 45.0 / (Math.PI * Math.pow(sim.H, 5.));

        this.simulationParamsNeedUpdate = true;
    }

    #getNormalizedPointerCoords(e) {
        return vec2.fromValues(
            (e.clientX / this.viewportSize[0]) * 2. - 1, 
            (1 - (e.clientY / this.viewportSize[1])) * 2. - 1
        );
    }

    #initTextures() {
         /** @type {WebGLRenderingContext} */
         const gl = this.gl;

         // get a power of two texture size
         this.textureSize = 2**Math.ceil(Math.log2(Math.sqrt(this.NUM_PARTICLES)));
 
         // update the particle size to fill the texture space
         this.NUM_PARTICLES = this.textureSize * this.textureSize;
         this.simulationParams.PARTICLE_COUNT = this.NUM_PARTICLES;
         this.simulationParamsNeedUpdate = true;
 
         console.log('number of particles:', this.NUM_PARTICLES);
 
         // update the sort params
         this.logNumParticles = Math.log2(this.textureSize);
         this.totalSortSteps = ((this.logNumParticles + this.logNumParticles) * (this.logNumParticles + this.logNumParticles + 1)) / 2;
 
         // define the cell sizes
         // use a fixed cell side count for this project
         this.cellSideCount = 11;
         this.numCells = this.cellSideCount * this.cellSideCount;
 
         console.log('number of cells:', this.numCells);

         // heightmap size
         this.heightMapSize = this.planeResolution * 2;
 
         const initVelocities = new Float32Array(this.NUM_PARTICLES * 4);
         const initForces = new Float32Array(this.NUM_PARTICLES * 4);
         const initPositions = new Float32Array(this.NUM_PARTICLES * 4);
 
         for(let i=0; i<this.NUM_PARTICLES; ++i) {
             initVelocities[i * 4 + 0] = 0;
             initVelocities[i * 4 + 1] = 0;
             initPositions[i * 4 + 0] = Math.random() * 2 - 1;
             initPositions[i * 4 + 1] = Math.random() * 2 - 1;
         }
 
         // empty offset texture
         this.initialOffsetTextureData = new Uint16Array(this.numCells);
         this.initialOffsetTextureData.fill(Number.MAX_VALUE);
 
         const defaultOptions = {
             width: this.textureSize,
             height: this.textureSize,
             min: gl.NEAREST, 
             mag: gl.NEAREST,
             wrap: gl.REPEAT
         }
 
         const defaultVectorTexOptions = {
             ...defaultOptions,
             format: gl.RGBA,
             internalFormat: gl.RGBA32F, 
         }
 
         const defaultIndicesTexOptions = {
             ...defaultOptions,
             format: gl.RG_INTEGER,
             internalFormat: gl.RG16UI,
             wrap: gl.CLAMP_TO_EDGE
         }
 
         this.offsetTextureOptions = {
             ...defaultOptions,
             width: this.cellSideCount,
             height: this.cellSideCount,
             format: gl.RED_INTEGER,
             internalFormat: gl.R16UI,
             wrap: gl.CLAMP_TO_EDGE
         }
 
         this.textures = twgl.createTextures(gl, { 
             densityPressure: {
                 ...defaultOptions,
                 format: gl.RG, 
                 internalFormat: gl.RG32F, 
                 src: new Float32Array(this.NUM_PARTICLES * 2)
             },
             force: { ...defaultVectorTexOptions, src: [...initForces] },
             position1: { ...defaultVectorTexOptions, src: [...initPositions] },
             position2: { ...defaultVectorTexOptions, src: [...initPositions] },
             velocity1: { ...defaultVectorTexOptions, src: [...initVelocities] },
             velocity2: { ...defaultVectorTexOptions, src: [...initVelocities] },
             indices1: {
                 ...defaultIndicesTexOptions,
                 src: new Uint16Array(this.NUM_PARTICLES * 4)
             },
             indices2: {
                 ...defaultIndicesTexOptions,
                 src: new Uint16Array(this.NUM_PARTICLES * 4)
             },
             offset: {
                 ...this.offsetTextureOptions,
                 src: this.initialOffsetTextureData,
             },
             heightMap: {
                min: gl.LINEAR, 
                mag: gl.LINEAR,
                wrap: gl.CLAMP_TO_EDGE,
                width: this.heightMapSize,
                height: this.heightMapSize,
                format: gl.RED, 
                internalFormat: gl.R32F, 
                src: new Float32Array(this.heightMapSize * this.heightMapSize)
            },
         });
 
         this.currentPositionTexture = this.textures.position2;
         this.currentVelocityTexture = this.textures.velocity2;
    }

    #initEnvMap() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        this.envMapTextureLoaded = false;

        this.envMapTexture = twgl.createTexture(gl, {
            src: new URL('../assets/env-map-01.jpg', import.meta.url).toString(),
        }, () => this.envMapTextureLoaded = true);
    }

    #initTweakpane() {
        if (!this.pane) return;

        const sim = this.pane.addFolder({ title: 'Simulation' });
        sim.addInput(this.simulationParams, 'MASS', { min: 0.01, max: 5, });
        sim.addInput(this.simulationParams, 'REST_DENS', { min: 0.1, max: 5, });
        sim.addInput(this.simulationParams, 'GAS_CONST', { min: 10, max: 500, });
        sim.addInput(this.simulationParams, 'VISC', { min: 1, max: 20, });
        sim.addInput(this.simulationParams, 'STEPS', { min: 0, max: 6, step: 1 });

        const pointer = this.pane.addFolder({ title: 'Pointer' });
        pointer.addInput(this.pointerParams, 'RADIUS', { min: 0.1, max: 5, });
        pointer.addInput(this.pointerParams, 'STRENGTH', { min: 1, max: 35, });

        //const interaction = this.pane.addFolder({ title: 'Interaction' });
        //interaction.addInput(this, 'ZOOM', { min: 0, max: 1, });

        sim.on('change', () => this.#updateSimulationParams());
        pointer.on('change', () => this.pointerParamsNeedUpdate = true);
    }

    #updatePointer() {
        this.pointerLerp[0] += (this.pointer[0] - this.pointerLerp[0]) / 5;
        this.pointerLerp[1] += (this.pointer[1] - this.pointerLerp[1]) / 5;

        vec2.subtract(this.pointerLerpDelta, this.pointerLerp, this.pointerLerpPrev);
        vec2.copy(this.pointerLerpPrev, this.pointerLerp);
    }

    #simulate(deltaTime) {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        this.#prepare();

        if (this.simulationParamsNeedUpdate) {
            twgl.setBlockUniforms(
                this.simulationParamsUBO,
                {
                    ...this.simulationParams,
                    CELL_TEX_SIZE: [this.cellSideCount, this.cellSideCount],
                    CELL_SIZE: this.simulationParams.H
                }
            );
            twgl.setUniformBlock(gl, this.pressurePrg, this.simulationParamsUBO);
            this.simulationParamsNeedUpdate = false;
        } else {
            twgl.bindUniformBlock(gl, this.pressurePrg, this.simulationParamsUBO);
        }


        // calculate density and pressure for every particle
        gl.useProgram(this.pressurePrg.program);
        twgl.bindFramebufferInfo(gl, this.pressureFBO);
        gl.bindVertexArray(this.quadVAO);
        twgl.setUniforms(this.pressurePrg, { 
            u_positionTexture: this.inFBO.attachments[0],
            u_indicesTexture: this.currentIndicesTexture,
            u_offsetTexture: this.textures.offset,
        });
        twgl.drawBufferInfo(gl, this.quadBufferInfo);


        // calculate pressure-, viscosity- and boundary forces for every particle
        gl.useProgram(this.forcePrg.program);
        twgl.bindFramebufferInfo(gl, this.forceFBO);
        twgl.setUniforms(this.forcePrg, { 
            u_densityPressureTexture: this.pressureFBO.attachments[0],
            u_positionTexture: this.inFBO.attachments[0], 
            u_velocityTexture: this.inFBO.attachments[1],
            u_indicesTexture: this.currentIndicesTexture,
            u_offsetTexture: this.textures.offset,
            u_cellTexSize: [this.cellSideCount, this.cellSideCount],
            u_cellSize: this.simulationParams.H,
        });
        twgl.drawBufferInfo(gl, this.quadBufferInfo);

        // perform the integration to update the particles position and velocity
        gl.useProgram(this.integratePrg.program);
        twgl.bindFramebufferInfo(gl, this.outFBO);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        twgl.setUniforms(this.integratePrg, { 
            u_positionTexture: this.inFBO.attachments[0], 
            u_velocityTexture: this.inFBO.attachments[1],
            u_forceTexture: this.forceFBO.attachments[0],
            u_densityPressureTexture: this.pressureFBO.attachments[0],
            u_pointerPos: this.pointerLerp,
            u_pointerVelocity: this.pointerLerpDelta,
            u_dt: deltaTime,
            u_frames: this.#frames,
            u_zoom: this.ZOOM,
            u_domainScale: this.domainScale
        });
        twgl.setBlockUniforms(
            this.pointerParamsUBO,
            {
                pointerRadius: this.pointerParams.RADIUS,
                pointerStrength: this.pointerParams.STRENGTH,
                pointerPos: this.pointerLerp,
                pointerVelocity: this.pointerLerpDelta
            } 
        );
        twgl.setUniformBlock(gl, this.integratePrg, this.pointerParamsUBO);
        twgl.drawBufferInfo(gl, this.quadBufferInfo);

        // update the current result textures
        this.currentPositionTexture = this.outFBO.attachments[0];
        this.currentVelocityTexture = this.outFBO.attachments[1];

        // swap the integrate FBOs
        const tmp = this.inFBO;
        this.inFBO = this.outFBO;
        this.outFBO = tmp;
    }

    #prepare() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        // update the indices structure
        gl.useProgram(this.indicesPrg.program);
        twgl.bindFramebufferInfo(gl, this.indices1FBO);
        gl.bindVertexArray(this.quadVAO);
        twgl.setUniforms(this.indicesPrg, { 
            u_positionTexture: this.currentPositionTexture,
            u_cellTexSize: [this.cellSideCount, this.cellSideCount],
            u_cellSize: this.simulationParams.H,
            u_domainScale: this.domainScale,
        });
        twgl.drawBufferInfo(gl, this.quadBufferInfo);

        // sort by cell id
        let sortOutFBO = this.indices1FBO;
        let sortInFBO = this.indices2FBO;
        gl.useProgram(this.sortPrg.program);

        // odd-even merge sort
        let pass = -1;
        let stage = -1;
        let stepsLeft = this.totalSortSteps;
        while(stepsLeft) {
            // update pass and stage uniforms
            pass--;
            if (pass < 0) {
                // next stage
                stage++;
                pass = stage;
            }

            const pstage = (1 << stage);
            const ppass  = (1 << pass);

            twgl.bindFramebufferInfo(gl, sortInFBO);
            twgl.setUniforms(this.sortPrg, { 
                u_indicesTexture: sortOutFBO.attachments[0],
                u_twoStage: pstage + pstage,
                u_passModStage: ppass % pstage,
                u_twoStagePmS1: (pstage + pstage) - (ppass % pstage) - 1,
                u_texSize: [this.textureSize, this.textureSize],
                u_ppass: ppass
            });
            twgl.drawBufferInfo(gl, this.quadBufferInfo);

            // buffer swap
            const tmp = sortOutFBO;
            sortOutFBO = sortInFBO;
            sortInFBO = tmp;

            stepsLeft--;
        }

        // set the offset list elements
        gl.useProgram(this.offsetPrg.program);
        twgl.bindFramebufferInfo(gl, this.offsetFBO);
        twgl.setUniforms(this.offsetPrg, { 
            u_indicesTexture: sortOutFBO.attachments[0],
            u_texSize: [this.cellSideCount, this.cellSideCount],
            u_particleTexSize: [this.textureSize, this.textureSize],
        });
        gl.clearColor(1, 0, 0, 0);
        twgl.drawBufferInfo(gl, this.quadBufferInfo);

        this.currentIndicesTexture = sortOutFBO.attachments[0];
    }

    #renderHeightMap() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        // draw height map
        gl.useProgram(this.heightMapPrg.program);
        twgl.bindFramebufferInfo(gl, this.heightMapFBO);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(this.quadVAO);
        twgl.setUniforms(this.heightMapPrg, { 
            u_particlePosTexture: this.currentPositionTexture,
            u_heightFactor: this.#remapZoomForHeight(this.ZOOM),
            u_scale: this.#remapHeightMapZoomScale(this.ZOOM),
            u_smoothFactor: this.#remapSmoothFactorZoom(this.ZOOM),
            u_spikeFactor: this.#remapSpikeFactorZoom(this.ZOOM)
        });
        twgl.drawBufferInfo(gl, this.quadBufferInfo);
    }

    #animate(deltaTime) {
        this.#updatePointer();

        if (this.isEntryAnimationDone) {
            // get the latest audio control value
            let targetZoomOffset = this.audioControl.getValue(); // [0,1]
            targetZoomOffset = targetZoomOffset === -1 ? 0 : targetZoomOffset;
            this.targetZoomLerp += (targetZoomOffset - this.targetZoomLerp) / 10;
            // wobble the zoom factor by the offset from the audio control value
            const deltaZoomOffset = (this.zoomOffset - this.targetZoomLerp);
            this.zoomOffsetMomentum -= deltaZoomOffset / 50;
            this.zoomOffsetMomentum *= 0.92;
            this.zoomOffset += this.zoomOffsetMomentum;
            if (this.audioControl.isInitialized) this.ZOOM = 0.5 - this.zoomOffset / 2;
        } else {

            if (this.entryProgress >= this.entryDelay) {
                const frameProgress = (this.entryProgress - this.entryDelay);
                const part1 = this.entryDuration * .7;
                const part2 = this.entryDuration - part1;

                // first part of entry animation: rise until peak
                if (frameProgress < part1) {
                    const progress = frameProgress / part1;
                    const t = easeInOutExpo(progress);
                    this.ZOOM = 1 - t;
                } else {
                    const progress = (frameProgress - part1) / part2;
                    const t = easeInOutCubic(progress);
                    this.ZOOM = 0.5 * t;
                }

            }

            this.entryProgress += this.#deltaFrames;

            if (this.entryProgress >= this.entryDuration + this.entryDelay) {
                if (this.onEntryAnimationDone) this.onEntryAnimationDone();
                this.isEntryAnimationDone = true;
            }
        }

        

        // use a fixed deltaTime of 10 ms adapted to
        // device frame rate
        deltaTime = 16 * this.#deltaFrames;

        // simulate at least once
        this.#simulate(deltaTime);

        // clear the pointer force so that it wont add up during
        // subsequent simulation steps
        vec2.set(this.pointerLerpDelta, 0, 0);

        // additional simulation steps
        for(let i=0; i<this.simulationParams.STEPS; ++i) {
            this.#simulate(deltaTime);
        }        
        
        this.#renderHeightMap();
    }

    #render() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        // draw ground
        twgl.bindFramebufferInfo(gl, null);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        const cv = .05;
        gl.clearColor(cv, cv, cv, 1.);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.groundPrg.program);
        twgl.setUniforms(this.groundPrg, {
            u_worldMatrix: this.groundWorldMatrix,
            u_viewMatrix: this.camera.matrices.view,
            u_projectionMatrix: this.camera.matrices.projection,
            u_cameraPosition: this.camera.position,
            u_envMapTexture: this.envMapTexture,
            u_zoom: this.ZOOM
        });
        gl.bindVertexArray(this.groundVAO);
        gl.drawElements(gl.TRIANGLES, this.groundBufferInfo.numElements, gl.UNSIGNED_SHORT, 0);


        // draw spikes
        gl.useProgram(this.spikesPrg.program);
        gl.enable(gl.DEPTH_TEST);
        twgl.setUniforms(this.spikesPrg, {
            u_worldMatrix: this.spikesWorldMatrix,
            u_viewMatrix: this.camera.matrices.view,
            u_projectionMatrix: this.camera.matrices.projection,
            u_heightMapTexture: this.textures.heightMap,
            u_zoom: this.ZOOM,
            u_cameraPosition: this.camera.position,
            u_envMapTexture: this.envMapTexture
        });
        gl.bindVertexArray(this.spikesVAO);
        gl.drawElements(gl.TRIANGLES, this.spikesBufferInfo.numElements, gl.UNSIGNED_SHORT, 0);

        

       if (this.isDev) {
            /*const maxViewportSide = Math.max(this.viewportSize[0], this.viewportSize[1]);
            // draw helper view of particle texture
            gl.viewport(0, 0, maxViewportSide / 3, maxViewportSide / 3);
            gl.disable(gl.CULL_FACE);
            gl.disable(gl.DEPTH_TEST);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.DST_ALPHA);
            gl.useProgram(this.drawPrg.program);
            twgl.setUniforms(this.drawPrg, { 
                u_positionTexture: this.currentPositionTexture,
                u_velocityTexture: this.currentVelocityTexture,
                u_resolution: [maxViewportSide / 4, maxViewportSide / 4],
                u_cellTexSize: [this.cellSideCount, this.cellSideCount],
                u_cellSize: this.simulationParams.H,
                u_domainScale: this.domainScale,
            });
            gl.drawArrays(gl.POINTS, 0, this.NUM_PARTICLES);
            gl.disable(gl.BLEND);*/

            /*const maxViewportSide = Math.max(this.viewportSize[0], this.viewportSize[1]);
            // draw helper view of particle texture
            gl.viewport(0, 0, maxViewportSide / 3, maxViewportSide / 3);
            gl.bindVertexArray(this.quadVAO);
            gl.useProgram(this.testPrg.program);
            twgl.setUniforms(this.drawPrg, { 
                u_heightMapTexture: this.textures.heightMap
            });
            twgl.drawBufferInfo(gl, this.quadBufferInfo);*/
        }
    }

    #updateCameraMatrix() {
        mat4.targetTo(this.camera.matrix, this.camera.position, [0, 0, 0], this.camera.up);
        mat4.invert(this.camera.matrices.view, this.camera.matrix);
    }

    #updateProjectionMatrix(gl) {
        this.camera.aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;

        const height = .4;
        const distance = this.camera.position[2];
        if (this.camera.aspect > 1) {
            this.camera.fov = 2 * Math.atan( height / distance );
        } else {
            this.camera.fov = 2 * Math.atan( (height / this.camera.aspect) / distance );
        }

        mat4.perspective(this.camera.matrices.projection, this.camera.fov, this.camera.aspect, this.camera.near, this.camera.far);
        mat4.invert(this.camera.matrices.inversProjection, this.camera.matrices.projection);
        mat4.multiply(this.camera.matrices.inversViewProjection, this.camera.matrix, this.camera.matrices.inversProjection)
    }

    #getPointerSpikesPlaneIntersection() {
        const p = this.#screenToWorldPosition(this.pointer[0], this.pointer[1], 0);
        const ray = vec3.subtract(vec3.create(), p, this.camera.position);
        const t = - this.camera.position[1] / ray[1];
        vec3.scale(ray, ray, t);
        const i = vec3.add(vec3.create(), this.camera.position, ray);
        vec3.scale(i, i, 1 / (this.ZOOM + this.#remapHeightMapZoomScale(this.ZOOM)));
        // swap z with y to match simulation plane
        return vec3.fromValues(i[0], i[2], 0);
    }

    #screenToWorldPosition(x, y, z) {
        const ndcPos = vec3.fromValues(x, y, z); 
        const worldPos = vec4.transformMat4(vec4.create(), vec4.fromValues(ndcPos[0], ndcPos[1], ndcPos[2], 1), this.camera.matrices.inversViewProjection);
        if (worldPos[3] !== 0){
            vec4.scale(worldPos, worldPos, 1 / worldPos[3]);
        }

        return worldPos;
    }

    #remapZoomForHeight(zoom) {
        // https://www.desmos.com/calculator/lac2i0bgum
        return -0.36 * zoom * zoom + -0.02 * zoom + 0.38;
    }

    #remapHeightMapZoomScale(zoom) {
        return 2 * zoom * zoom + zoom + 1;
    }

    #remapSmoothFactorZoom(zoom) {
        return .3 * zoom * zoom + -0.07 * zoom + 0.02;
    }

    #remapSpikeFactorZoom(zoom) {
        return 12 * zoom * zoom + -36 * zoom + 25;
    }
}
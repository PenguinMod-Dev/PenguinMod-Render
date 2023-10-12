const twgl = require('twgl.js');

const TextWrapper = require('./util/text-wrapper');
const CanvasMeasurementProvider = require('./util/canvas-measurement-provider');
const Skin = require('./Skin');

const FontHeightRatio = 0.9; // Height, in Scratch pixels, of the text, as a proportion of the font's size

class TextCostumeSkin extends Skin {
  /**
   * Create a new text costume skin.
   * @param {!int} id - The ID for this Skin.
   * @param {!RenderWebGL} renderer - The renderer which will use this skin.
   * @constructor
   * @extends Skin
   */
    constructor(id, renderer) {
        super(id);

        /** @type {RenderWebGL} */
        this._renderer = renderer;

        /** @type {HTMLCanvasElement} */
        this._canvas = document.createElement('canvas');

        /** @type {WebGLTexture} */
        this._texture = null;

        /** @type {Array<number>} */
        this._size = [0, 0];

        /** @type {number} */
        this._renderedScale = 0;

        /** @type {Array<string>} */
        this._lines = [];

        /** @type {object} */
        this._textAreaSize = {
        width: 0,
        height: 0
        };

        /** @type {boolean} */
        this._textDirty = true;

        /** @type {boolean} */
        this._textureDirty = true;
        this.measurementProvider = new CanvasMeasurementProvider(this._canvas.getContext('2d'));
        this.textWrapper = new TextWrapper(this.measurementProvider);
        this.style = {};
    }

    /**
     * Dispose of this object. Do not use it after calling this method.
     */
    dispose() {
        if (this._texture) {
            this._renderer.gl.deleteTexture(this._texture);

            this._texture = null;
        }

        this._canvas = null;
        this.textWrapper = null;
        this.measurementProvider = null;
    }

    /**
     * @return {Array<number>} the dimensions, in Scratch units, of this skin.
     */
    setTextAndStyle(textState) {
        this._text = textState.text;
        this.style.FONT = textState.font;
        this.style.COLOR = textState.color;
        this.style.MAX_LINE_WIDTH = textState.maxWidth;
        this.style.FONT_SIZE = textState.size;
        this.style.LINE_HEIGHT = textState.size + textState.size / 7;
        this.style.ALIGN = textState.align;
        this.style.STROKE_WIDTH = textState.strokeWidth;
        this.style.STROKE_COLOR = textState.strokeColor;
        this.style.VERTICAL_PADDING = textState.size / 7;
        this.style.RAINBOW = textState.rainbow;
        this.measurementProvider.setFontAndSize(this.style.FONT, this.style.FONT_SIZE);
        this._textDirty = true;
        this._textureDirty = true;
        this.emitWasAltered();
    }

    /**
     * Re-style the canvas after resizing it. This is necessary to ensure proper text measurement.
     */
    _restyleCanvas() {
        this._canvas.getContext('2d').font = `${this.style.FONT_SIZE}px ${this.style.FONT}, sans-serif`;
    }

    /**
     * Update the array of wrapped lines and the text dimensions.
     */
    _reflowLines(scale) {
        let maxWidth = this.style.MAX_LINE_WIDTH; // Max width is in "native scratch units", convert to raw pixels

        // pm: these 2 lines seem to cause problems when scaling the sprite or entering fullscreen, they are now in timeout
        // maxWidth *= this._renderer.gl.canvas.width / this._renderer.getNativeSize()[0]; // Shrink the max width if the drawable is scaled up
        
        // maxWidth /= scale || 1;

        this._lines = this.textWrapper.wrapText(maxWidth, this._text, this.style.FONT_SIZE, this.style.FONT); // Calculate the canvas-space size of the text

        this._size[0] = maxWidth;
        this._size[1] = this.style.LINE_HEIGHT * this._lines.length + this.style.VERTICAL_PADDING * 2;

        if (this.style.STROKE_WIDTH > 0) {
            this._size[0] += this.style.STROKE_WIDTH * 2;
            this._size[1] += this.style.STROKE_WIDTH * 2;
        }

        this._textDirty = false;
    }

    get width () {
        let longestLineWidth = 0;
        for (const line of this._lines) {
            longestLineWidth = Math.max(longestLineWidth, this.measurementProvider.measureText(line));
        }
        return longestLineWidth;
    }

    get height () {
        return this._size[1]
    }
    /**
     * Render this text text at a certain scale, using the current parameters, to the canvas.
     * @param {number} scale The scale to render the text at
     */
    _renderText(scale) {
        const ctx = this._canvas.getContext('2d');

        if (this._textDirty) {
            this._reflowLines(scale);
        } // Resize the canvas to the correct screen-space size

        // console.log(this._size);
        this._canvas.width = Math.ceil(this._size[0] * scale);
        this._canvas.height = Math.ceil(this._size[1] * scale);

        this._restyleCanvas(); // Reset the transform before clearing to ensure 100% clearage

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        ctx.scale(scale, scale);
        ctx.stroke();
        ctx.fill(); // Draw each line of text

        ctx.fillStyle = this.style.COLOR;
        ctx.font = "".concat(this.style.FONT_SIZE, "px ").concat(this.style.FONT, ", sans-serif");
        const lines = this._lines;

        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const line = lines[lineNumber];
            const lineWidth = this.measurementProvider.measureText(line);
            let xOffset = 0;
            if (this.style.ALIGN === 'center') xOffset = this._size[0] / 2 - lineWidth / 2;
            if (this.style.ALIGN === 'right') xOffset = this._size[0] - lineWidth;
            let yOffset = this.style.LINE_HEIGHT * lineNumber + FontHeightRatio * this.style.FONT_SIZE + this.style.VERTICAL_PADDING;

            if (this.style.STROKE_WIDTH > 0) {
            yOffset += this.style.STROKE_WIDTH;
            ctx.lineWidth = this.style.STROKE_WIDTH * 2;
            ctx.strokeStyle = this.style.STROKE_COLOR;
            ctx.strokeText(line, xOffset, yOffset);
            }

            if (this.style.RAINBOW) {
            const gradient = ctx.createLinearGradient(xOffset, 0, xOffset + lineWidth, 0);
            const stops = 12;

            for (let i = 0; i < stops; i++) {
                gradient.addColorStop(i / stops, "hsl(".concat(360 * i / stops, ", 100%, 50%)"));
            }

            ctx.fillStyle = gradient;
            }

            ctx.fillText(line, xOffset, yOffset);
        }

        const center = [this._size[0] / 2, FontHeightRatio * this.style.FONT_SIZE]; // // Uncommenting these lines moves the text when alignment is changed
        // if (this.style.ALIGN === 'left') {
        //     center[0] = 0;
        // }
        // if (this.style.ALIGN === 'right') {
        //     center[0] = this._size[0];
        // }

        this._rotationCenter = center;
        this._renderedScale = scale;
    }

    /**
     * @param {Array<number>} scale - The scaling factors to be used, each in the [0,100] range.
     * @return {WebGLTexture} The GL texture representation of this skin when drawing at the given scale.
     */
    getTexture(scale) {
        // The texture only ever gets uniform scale. Take the larger of the two axes.
        const scaleMax = scale ? Math.max(Math.abs(scale[0]), Math.abs(scale[1])) : 100;
        let requestedScale = scaleMax / 100; // If we already rendered the text at this scale, we can skip re-rendering it.

        const customConfig = this._renderer.customRenderConfig.textCostumeResolution;
        if (customConfig.fixed) {
            requestedScale = customConfig.value;
        } else if (customConfig.capped) {
            if (requestedScale > customConfig.value) {
                requestedScale = customConfig.value;
            }
        }

        if (this._textureDirty || this._renderedScale !== requestedScale) {
            if (this._renderedScale !== requestedScale) this._textDirty = true;

            this._renderText(requestedScale);

            if (this._canvas.width === 0 || this._canvas.height === 0) return super.getTexture();
            this._textureDirty = false;

            const context = this._canvas.getContext('2d');

            const textureData = context.getImageData(0, 0, this._canvas.width, this._canvas.height);
            const gl = this._renderer.gl;

            if (this._texture === null) {
            const textureOptions = {
                auto: false,
                wrap: gl.CLAMP_TO_EDGE
            };
            this._texture = twgl.createTexture(gl, textureOptions);
            }

            this._setTexture(textureData);
        }

        return this._texture;
    }
    get size() {
        if (this._textDirty) {
            this._reflowLines(this._renderedScale);
        }

        return this._size;
    }
    get maxScale() {
        return 10; // = 1000% size maximum. Needed to override default clamping behavior when setting size
    }
}

module.exports = TextCostumeSkin;


  /**
   * @typedef TextState
   * @property {TextCostumeSkin} skin
   */


  const Skin = require('./Skin');
  const CanvasMeasurementProvider = require('./util/canvas-measurement-provider');
  const twgl = require('twgl');

  /**
   * @param {number} c
   * @returns {string}
   */
  const formatComponent = (c) => Math.round(c).toString(16).padStart(2, "0");

  /**
   * @param {[number, number, number]} color
   * @returns {string}
   */
  const formatColor = (color) =>
    `#${formatComponent(color[0])}${formatComponent(color[1])}${formatComponent(
      color[2]
    )}`;

  /**
   * @param {number} h hue from 0-1
   * @param {number} s saturation from 0-1
   * @param {number} v value from 0-1
   * @returns {[number, number, number]} RGB channels from 0-255
   */
  const hsvToRGB = (h, s, v) => {
    // https://en.wikipedia.org/wiki/HSL_and_HSV
    var r, g, b;
    var i = Math.floor(h * 6);
    var f = h * 6 - i;
    var p = v * (1 - s);
    var q = v * (1 - f * s);
    var t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0:
        (r = v), (g = t), (b = p);
        break;
      case 1:
        (r = q), (g = v), (b = p);
        break;
      case 2:
        (r = p), (g = v), (b = t);
        break;
      case 3:
        (r = p), (g = q), (b = v);
        break;
      case 4:
        (r = t), (g = p), (b = v);
        break;
      case 5:
        (r = v), (g = p), (b = q);
        break;
    }
    return [(r * 255) | 0, (g * 255) | 0, (b * 255) | 0];
  };

  /**
   * @param {CanvasGradient} gradient
   * @param {number} offset number of cycles to offset by
   */
  const addRainbowStops = (gradient, offset) => {
    const NUMBER_STOPS = 20;
    for (let i = 0; i < NUMBER_STOPS; i++) {
      const exactPosition = i / NUMBER_STOPS;
      let offsetPosition = (exactPosition - offset) % 1;
      if (offsetPosition < 0) {
        offsetPosition += 1;
      }
      const rgb = hsvToRGB(offsetPosition, 1, 1);
      gradient.addColorStop(exactPosition, formatColor(rgb));
    }
  };

  class TextCostumeSkin extends Skin {
    constructor(id, drawable) {
      super(id, renderer);

      /** @type {RenderWebGL.Drawable} */
      this.drawable = drawable;
      /** @type {number} */
      this._previousDrawableXScale = 100;

      this.canvas = document.createElement("canvas");
      this.canvas.width = 0;
      this.canvas.height = 0;
      this.ctx = this.canvas.getContext("2d");

      this.text = "";
      this.color = DEFAULT_COLOR;
      this.textWidth = DEFAULT_WIDTH;
      this.fontFamily = DEFAULT_FONT;
      this.baseFontSize = DEFAULT_FONT_SIZE;
      this.align = DEFAULT_ALIGN;

      /** @type {Array<{text: string; width: number;}>} */
      this.lines = [];
      /** @type {[number, number]} */
      this._size = [0, 0];
      /** @type {[number, number]} */
      this._rotationCenter = [0, 0];

      // Updated in _updateFontDimensions
      this.calculatedFontSize = 0;
      this.lineHeight = 0;
      this.verticalPadding = 0;
      this.wrapWidth = 0;

      this._textDirty = false;
      this._textureDirty = false;
      this._renderedAtScale = 1;
      this._renderTime = 0;
      this._reflowTime = 0;

      this.isTyping = false;
      this.typeAnimationInterval = null;
      this.typeDelay = DEFAULT_TYPE_DELAY;

      this.isRainbow = false;
      this.rainbowStartTime = 0;
      this.rainbowTimeout = null;
      this.rainbowDuration = DEFAULT_RAINBOW_DURATION;

      this.isZooming = false;
      this.zoomStartTime = 0;
      this.zoomTimeout = null;
      this.zoomDuration = DEFAULT_ZOOM_DURATION;

      /** @type {(() => void)|null} */
      this.resolveOngoingAnimation = null;
    }

    // Part of Skin API
    dispose() {
      if (this._texture) {
        gl.deleteTexture(this._texture);
        this._texture = null;
      }
      this.canvas = null;
      this.ctx = null;
      super.dispose();
    }

    // Part of Skin API
    get size() {
      if (this._needsReflow()) {
        this._reflowText();
      }
      return this._size;
    }

    // Part of Skin API
    useNearest() {
      return false;
    }

    _needsReflow() {
      return (
        this._textDirty ||
        (this.isZooming && this._reflowTime !== globalFrameTime) ||
        this._previousDrawableXScale !== Math.abs(this.drawable.scale[0])
      );
    }

    _updateFontDimensions() {
      this.calculatedFontSize = this.baseFontSize;
      if (this.isZooming) {
        // TODO: it looks like Scratch's animation always starts at least a little visible
        const time = globalFrameTime - this.zoomStartTime;
        const progress = Math.max(0, Math.min(1, time / this.zoomDuration));
        this.calculatedFontSize *= progress;
      }
      this.lineHeight = (this.baseFontSize * 8) / 7;
      // Always use the base size for padding. This makes the zoom animation look better.
      this.verticalPadding = this.baseFontSize / 7;
      // Only use horizontal scale for wrap width for compatibility with stretch extension.
      this.wrapWidth =
        this.textWidth / (Math.abs(this.drawable.scale[0]) / 100);
    }

    _getFontStyle() {
      return `${this.calculatedFontSize}px ${this.fontFamily}, sans-serif`;
    }

    _reflowText() {
      this._textDirty = false;
      this._textureDirty = true;
      this._reflowTime = globalFrameTime;
      this._previousDrawableXScale = Math.abs(this.drawable.scale[0]);

      this._updateFontDimensions();
      this.ctx.font = this._getFontStyle();

      // need to make new ones each time to avoid caching incorrectly across fonts
      const measurementProvider = new CanvasMeasurementProvider(this.ctx);
      /** @type {RenderWebGL.TextWrapper} */
      const textWrapper = renderer.createTextWrapper(measurementProvider);

      const lines = textWrapper.wrapText(this.wrapWidth, this.text);
      this.lines = lines.map((line) => {
        const trimmed = line.trimEnd();
        return {
          text: trimmed,
          width: measurementProvider.measureText(trimmed),
        };
      });

      this._size[0] = this.wrapWidth;
      this._size[1] =
        this.lines.length * this.lineHeight + 2 * this.verticalPadding;

      // Centered horizontally
      this._rotationCenter[0] = this._size[0] / 2;
      // Vertical center is roughly below the first line of text
      this._rotationCenter[1] =
        this.calculatedFontSize * 0.9 + this.verticalPadding;
    }

    _renderAtScale(requestedScale) {
      this._renderedAtScale = requestedScale;
      this._textureDirty = false;
      this._renderTime = globalFrameTime;

      const scratchWidth = this._size[0];
      const scratchHeight = this._size[1];

      // Renderer's requested scale is accounted for at this point. Do not touch `requestedScale`
      // ever after this point.
      this.canvas.width = Math.ceil(scratchWidth * requestedScale);
      this.canvas.height = Math.ceil(scratchHeight * requestedScale);
      this.ctx.scale(requestedScale, requestedScale);

      const rainbowOffset = this.isRainbow
        ? (globalFrameTime - this.rainbowStartTime) / RAINBOW_TIME_PER
        : 0;
      this.ctx.fillStyle = this.color;
      this.ctx.font = this._getFontStyle();
      for (let i = 0; i < this.lines.length; i++) {
        const line = this.lines[i];
        const text = line.text;
        const lineWidth = line.width;

        let xOffset = 0;
        if (this.align === ALIGN_LEFT) {
          // already correct
        } else if (this.align === ALIGN_CENTER) {
          xOffset = (this.wrapWidth - lineWidth) / 2;
        } else {
          xOffset = this.wrapWidth - lineWidth;
        }

        if (this.isRainbow) {
          const gradient = this.ctx.createLinearGradient(
            xOffset,
            0,
            xOffset + lineWidth,
            0
          );
          addRainbowStops(gradient, rainbowOffset);
          this.ctx.fillStyle = gradient;
        }

        // TODO: something here is wrong
        this.ctx.fillText(
          text,
          xOffset,
          this.verticalPadding + i * this.lineHeight + this.baseFontSize
        );
      }

      if (!this._texture) {
        // @ts-expect-error - twgl not typed yet
        this._texture = twgl.createTexture(gl, {
          auto: false,
          wrap: gl.CLAMP_TO_EDGE,
        });
      }
      this._setTexture(this.canvas);
    }

    _invalidateTexture() {
      this._textureDirty = true;
      this._renderTime = 0;
      this.emitWasAltered();
    }

    _invalidateText() {
      this._textDirty = true;
      this._textureDirty = true;
      this._reflowTime = 0;
      this.emitWasAltered();
    }

    setText(text) {
      if (text !== this.text) {
        this.text = text;
        this._invalidateText();
      }
    }

    setColor(color) {
      if (color !== this.color) {
        this.color = color;
        this._invalidateTexture();
      }
    }

    setAlign(align) {
      if (align !== this.align) {
        this.align = align;
        this._invalidateTexture();
      }
    }

    setWidth(width) {
      if (width !== this.textWidth) {
        this.textWidth = width;
        this._invalidateText();
      }
    }

    setFontFamily(font) {
      if (font !== this.fontFamily) {
        this.fontFamily = font;
        this._invalidateText();
      }
    }

    getFontFamily() {
      return this.fontFamily;
    }

    getColor() {
      return this.color;
    }

    getWidth() {
      return this.textWidth;
    }

    getAlign() {
      return this.align;
    }

    _oneAnimationAtATime(newCallback) {
      this.cancelAnimation();
      return new Promise((resolve) => {
        this.resolveOngoingAnimation = () => {
          this.resolveOngoingAnimation = null;
          resolve();
        };
        newCallback(this.resolveOngoingAnimation);
      });
    }

    startTypeAnimation() {
      return this._oneAnimationAtATime((resolve) => {
        this.isTyping = true;
        const originalText = this.text;
        let i = 1;
        const update = () => {
          this.setText(originalText.substring(0, i));
        };
        update();

        this.typeAnimationInterval = setInterval(() => {
          i++;
          update();
          if (i >= originalText.length) {
            clearInterval(this.typeAnimationInterval);
            this.isTyping = false;
            resolve();
          }
        }, this.typeDelay);
      });
    }

    setTypeDelay(delay) {
      this.typeDelay = delay;
    }

    startRainbowAnimation() {
      return this._oneAnimationAtATime((resolve) => {
        this.isRainbow = true;
        this.rainbowStartTime = Date.now();
        this._invalidateTexture();
        this.rainbowTimeout = setTimeout(() => {
          this.isRainbow = false;
          resolve();
          this._invalidateTexture();
        }, this.rainbowDuration);
      });
    }

    setRainbowDuration(duration) {
      this.rainbowDuration = duration;
    }

    startZoomAnimation() {
      return this._oneAnimationAtATime((resolve) => {
        this.isZooming = true;
        this.zoomStartTime = Date.now();
        this._invalidateText();
        this.zoomTimeout = setTimeout(() => {
          this.isZooming = false;
          resolve();
          this._invalidateText();
        }, this.zoomDuration);
      });
    }

    setZoomDuration(duration) {
      this.zoomDuration = duration;
    }

    cancelAnimation() {
      if (this.resolveOngoingAnimation) {
        this.resolveOngoingAnimation();
        this.resolveOngoingAnimation = null;

        this.isTyping = false;
        clearInterval(this.typeAnimationInterval);

        this.isRainbow = false;
        clearTimeout(this.rainbowTimeout);

        this.isZooming = false;
        clearTimeout(this.zoomTimeout);

        // TODO: sometimes we only need to invalidate the texture at this point
        this._invalidateText();
      }
    }

    // Part of Skin API
    updateSilhouette(scale) {
      this.getTexture(scale);
      this._silhouette.unlazy();
    }

    // Part of Skin API
    getTexture(scale) {
      const MAX_SCALE = 10;
      const upperScale = scale
        ? Math.max(Math.abs(scale[0]), Math.abs(scale[1]))
        : 100;
      const calculatedScale = Math.min(MAX_SCALE, upperScale / 100);

      if (this._needsReflow()) {
        this._reflowText();
      }
      if (
        this._textureDirty ||
        (this.isRainbow && this._renderTime !== globalFrameTime) ||
        calculatedScale !== this._renderedAtScale
      ) {
        this._renderAtScale(calculatedScale);
      }

      return this._texture;
    }
  }
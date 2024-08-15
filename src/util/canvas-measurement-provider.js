class CanvasMeasurementProvider {
    /**
     * @param {CanvasRenderingContext2D} ctx - provides a canvas rendering context
     * with 'font' set to the text style of the text to be wrapped.
     */
    constructor (ctx) {
        this._ctx = ctx;
        this._cache = {};
    }


    // We don't need to set up or tear down anything here. Should these be removed altogether?

    /**
     * Called by the TextWrapper before a batch of zero or more calls to measureText().
     */
    beginMeasurementSession () {
        
    }

    /**
     * Called by the TextWrapper after a batch of zero or more calls to measureText().
     */
    endMeasurementSession () {
        
    }

    setFontAndSize (font, size) {
        this._ctx.font = `${size}px ${font}, sans-serif`;
        this._cache = {};
    }

    /**
     * Measure a whole string as one unit.
     * @param {string} text - the text to measure.
     * @returns {number} - the length of the string.
     */
    measureText (text) {
        const cacheName = this._ctx.font + text;
        if (!this._cache[cacheName]) {
            this._cache[cacheName] = this._ctx.measureText(text).actualBoundingBoxRight;
        }
        return this._cache[cacheName];
    }
}

module.exports = CanvasMeasurementProvider;

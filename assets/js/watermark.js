/** 工作台与分享页共用的斜向错行水印；计时和显隐由各页面管理。 */
(function(window) {
    'use strict';

    var cachedWidestDigit = {};

    function getWidestDigit(ctx, font) {
        if (cachedWidestDigit[font]) return cachedWidestDigit[font];
        var digit = '0';
        var maxW = ctx.measureText('0').width;
        for (var n = 1; n <= 9; n++) {
            var ch = String(n);
            var w = ctx.measureText(ch).width;
            if (w > maxW) {
                maxW = w;
                digit = ch;
            }
        }
        cachedWidestDigit[font] = digit;
        return digit;
    }

    function draw(canvas, overlay, text) {
        if (overlay._lastWatermarkText === text && overlay.style.backgroundImage) return;
        var ctx = canvas.getContext('2d');
        var font = '13px sans-serif';
        var angle = -25 * Math.PI / 180;
        ctx.font = font;
        // 按最宽数字预留时间宽度，分钟变化时不挪动整片水印。
        var digit = getWidestDigit(ctx, font);
        var textWidth = ctx.measureText(text.replace(/[0-9]/g, digit)).width;
        // 保留完整姓名与时间，并为旋转后的文字包围盒留出间距。
        var width = Math.max(340, Math.ceil((textWidth * Math.cos(angle) + 16 * Math.abs(Math.sin(angle)) + 96) / 2) * 2);
        var rowHeight = Math.max(160, Math.ceil(textWidth * Math.abs(Math.sin(angle)) + 16 * Math.cos(angle) + 64));
        var height = rowHeight * 2;
        var ratio = Math.min(window.devicePixelRatio || 1, 2);
        var targetW = Math.ceil(width * ratio);
        var targetH = Math.ceil(height * ratio);
        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        } else {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, targetW, targetH);
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.font = font;
        if (!overlay._cachedWatermarkInk) {
            overlay._cachedWatermarkInk = window.getComputedStyle(overlay).getPropertyValue('--watermark-ink').trim();
        }
        ctx.fillStyle = overlay._cachedWatermarkInk;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (var row = 0; row < 2; row++) {
            var centerX = row === 0 ? width / 2 : 0;
            // 跨左右边界补画同一行，避免平铺接缝把文字切掉。
            for (var copy = -1; copy <= 1; copy++) {
                ctx.save();
                ctx.translate(centerX + copy * width, (row + 0.5) * rowHeight);
                ctx.rotate(angle);
                ctx.fillText(text, 0, 0);
                ctx.restore();
            }
        }
        overlay._lastWatermarkText = text;
        overlay.style.backgroundSize = width + 'px ' + height + 'px';
        overlay.style.backgroundImage = 'url(' + canvas.toDataURL('image/png') + ')';
    }

    window.ProtoLoftWatermark = { draw: draw };
})(window);

package ninocraft.modules;

import net.minecraft.client.gui.DrawContext;

public final class Ui {
    public static final int ROSE = 0xFFE8436B;
    public static final int ROSE_HI = 0xFFFF5E7E;
    public static final int ROSE_DEEP = 0xFFC22A4F;
    public static final int ROSE_LIGHT = 0xFFFFB3C6;
    public static final int BLUSH = 0xFFFFE4EC;
    public static final int CREAM = 0xFFFFF6FA;
    public static final int PAPER = 0xFFFFFFFF;
    public static final int INK = 0xFF4A2B33;
    public static final int INK_SOFT = 0xFF9A7580;

    private Ui() {}

    public static void fillRound(DrawContext ctx, int x0, int y0, int x1, int y1, int r, int color) {
        int w = x1 - x0, h = y1 - y0;
        if (w <= 0 || h <= 0) return;
        r = Math.max(0, Math.min(r, Math.min(w / 2, h / 2)));
        if (r == 0) {
            ctx.fill(x0, y0, x1, y1, color);
            return;
        }
        int a = (color >>> 24) & 0xFF;
        int rgb = color & 0x00FFFFFF;
        int c0 = y0 + r, c1 = x0 + r, c2 = y1 - r, c3 = x1 - r;
        ctx.fill(x0 + r, y0, x1 - r, y1, color);
        ctx.fill(x0, y0 + r, x0 + r, y1 - r, color);
        ctx.fill(x1 - r, y0 + r, x1, y1 - r, color);
        if (a == 0) return;
        corner(ctx, x0, y0, c1, c0, r, 1, 1, a, rgb);
        corner(ctx, c3, y0, x1, c0, r, -1, 1, a, rgb);
        corner(ctx, x0, c2, c1, y1, r, 1, -1, a, rgb);
        corner(ctx, c3, c2, x1, y1, r, -1, -1, a, rgb);
    }

    private static void corner(DrawContext ctx, int bx0, int by0, int bx1, int by1, int r,
                               int sx, int sy, int a, int rgb) {
        double cx = sx > 0 ? bx1 - r : bx0 + r;
        double cy = sy > 0 ? by1 - r : by0 + r;
        for (int y = by0; y < by1; y++) {
            double dy = y + 0.5 - cy;
            double span = Math.sqrt(Math.max(0.0, (double) r * r - dy * dy));
            double edge = cx - sx * span;
            int start = sx > 0 ? (int) Math.floor(edge) + 1 : (int) Math.ceil(edge) - 1;
            int stop = sx > 0 ? (int) Math.ceil(cx) : (int) Math.floor(cx);
            if (stop > start) ctx.fill(Math.min(start, stop), y, Math.max(start, stop), y + 1, (a << 24) | rgb);
            double covered = Math.abs(start + (sx > 0 ? 0 : 1) - edge);
            double cov = Math.min(1.0, Math.max(0.0, covered));
            if (cov > 0.04 && a > 0) {
                int edgeX = sx > 0 ? start - 1 : start;
                int na = Math.max(1, (int) Math.round(a * cov));
                ctx.fill(edgeX, y, edgeX + 1, y + 1, (na << 24) | rgb);
            }
        }
    }

    public static void fillRoundStroke(DrawContext ctx, int x0, int y0, int x1, int y1, int r, int border, int fill) {
        fillRound(ctx, x0, y0, x1, y1, r, border);
        fillRound(ctx, x0 + 1, y0 + 1, x1 - 1, y1 - 1, Math.max(1, r - 1), fill);
    }

    public static void shadow(DrawContext ctx, int x0, int y0, int x1, int y1, int r) {
        fillRound(ctx, x0 - 3, y0 + 3, x1 + 3, y1 + 3, r, 0x10000000);
        fillRound(ctx, x0 - 2, y0 + 2, x1 + 2, y1 + 2, r, 0x1C000000);
        fillRound(ctx, x0 - 1, y0 + 1, x1 + 1, y1 + 1, r, 0x2A000000);
    }
}
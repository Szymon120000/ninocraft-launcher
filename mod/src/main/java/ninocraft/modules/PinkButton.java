package ninocraft.modules;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.Click;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.narration.NarrationMessageBuilder;
import net.minecraft.client.gui.widget.ClickableWidget;
import net.minecraft.text.Text;

public class PinkButton extends ClickableWidget {
    private final Runnable action;
    private boolean active;
    private int radius = 8;
    private boolean alignLeft;
    private boolean shadow = true;

    public PinkButton(int x, int y, int width, int height, Text message, boolean active, Runnable action) {
        super(x, y, width, height, message);
        this.active = active;
        this.action = action;
    }

    public void setActive(boolean a) {
        active = a;
    }

    public boolean isActive() {
        return active;
    }

    public void setRadius(int r) {
        radius = r;
    }

    public void setAlignLeft(boolean l) {
        alignLeft = l;
    }

    public void setShadow(boolean s) {
        shadow = s;
    }

    @Override
    protected void renderWidget(DrawContext ctx, int mouseX, int mouseY, float delta) {
        int x0 = getX(), y0 = getY(), x1 = x0 + getWidth(), y1 = y0 + getHeight();
        int bg = active ? Ui.ROSE : Ui.PAPER;
        int fg = active ? 0xFFFFFFFF : Ui.INK_SOFT;
        int border = active ? Ui.ROSE : Ui.ROSE_LIGHT;
        if (hovered) {
            bg = active ? Ui.ROSE_HI : Ui.CREAM;
            fg = active ? 0xFFFFFFFF : Ui.INK;
        }
        if (active && shadow) {
            Ui.shadow(ctx, x0, y0, x1, y1, radius);
        }
        Ui.fillRoundStroke(ctx, x0, y0, x1, y1, radius, border, bg);
        int tx = alignLeft ? x0 + 8 : (x0 + x1) / 2;
        int ty = y0 + (y1 - y0 - 8) / 2;
        if (alignLeft) {
            ctx.drawTextWithShadow(MinecraftClient.getInstance().textRenderer, getMessage(), tx, ty, fg);
        } else {
            ctx.drawCenteredTextWithShadow(MinecraftClient.getInstance().textRenderer, getMessage(), tx, ty, fg);
        }
    }

    @Override
    public void onClick(Click click, boolean doubleClick) {
        if (click.button() == 0) {
            action.run();
        }
    }

    @Override
    protected void appendClickableNarrations(NarrationMessageBuilder builder) {
    }
}
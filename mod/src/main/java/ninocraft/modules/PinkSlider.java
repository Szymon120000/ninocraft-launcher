package ninocraft.modules;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.widget.SliderWidget;
import net.minecraft.text.Text;

public class PinkSlider extends SliderWidget {
    public PinkSlider(int x, int y, int width, int height, Text message, double value) {
        super(x, y, width, height, message, value);
    }

    @Override
    protected void updateMessage() {
    }

    @Override
    protected void applyValue() {
    }

    @Override
    public void renderWidget(DrawContext ctx, int mouseX, int mouseY, float delta) {
        int x0 = getX(), y0 = getY(), x1 = x0 + getWidth();
        int cy = y0 + (getHeight() - 6) / 2;
        Ui.fillRound(ctx, x0, cy, x1, cy + 6, 3, 0xFFF3D2DB);
        int fillW = Math.max(4, (int) ((getWidth() - 6) * value));
        Ui.fillRound(ctx, x0 + 3, cy, x0 + 3 + fillW, cy + 6, 3, hovered ? Ui.ROSE_HI : Ui.ROSE);
        int knobX = x0 + 3 + fillW;
        Ui.shadow(ctx, knobX - 6, cy - 4, knobX + 6, cy + 10, 6);
        Ui.fillRound(ctx, knobX - 6, cy - 4, knobX + 6, cy + 10, 6, 0xFFFFFFFF);
        Ui.fillRound(ctx, knobX - 3, cy - 1, knobX + 3, cy + 7, 3, Ui.ROSE);
    }
}
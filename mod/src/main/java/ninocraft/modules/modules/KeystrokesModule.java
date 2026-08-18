package ninocraft.modules.modules;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.text.Text;
import ninocraft.modules.Module;
import ninocraft.modules.ModuleOption;
import ninocraft.modules.Ui;
import org.lwjgl.glfw.GLFW;

public class KeystrokesModule extends Module {
    private final ModuleOption.ChoiceOption position = new ModuleOption.ChoiceOption("position", "Position", "Bottom right", "Bottom right", "Bottom left");

    public KeystrokesModule() {
        super("keystrokes", "Keystrokes", "Shows your WASD, mouse and space keys on screen.");
        addOption(position);
    }

    private void key(DrawContext ctx, int x, int y, int w, int h, String label, boolean pressed) {
        int bg = pressed ? Ui.ROSE : 0x991C0F18;
        int fg = pressed ? 0xFFFFFFFF : 0xFFFFD9E2;
        if (pressed) {
            Ui.shadow(ctx, x, y, x + w, y + h, 6);
        }
        Ui.fillRound(ctx, x, y, x + w, y + h, 6, bg);
        if (!pressed) {
            Ui.fillRound(ctx, x, y, x + w, y + 1, 6, 0x66E8436B);
        }
        ctx.drawCenteredTextWithShadow(MinecraftClient.getInstance().textRenderer, Text.literal(label), x + w / 2, y + (h - 8) / 2, fg);
    }

    @Override
    public void onRenderHud(DrawContext ctx, RenderTickCounter tickCounter, int scaledWidth, int scaledHeight) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player == null || client.getWindow() == null) return;

        boolean fwd = client.options.forwardKey.isPressed();
        boolean back = client.options.backKey.isPressed();
        boolean left = client.options.leftKey.isPressed();
        boolean right = client.options.rightKey.isPressed();
        boolean jump = client.options.jumpKey.isPressed();
        long handle = client.getWindow().getHandle();
        boolean lmb = GLFW.glfwGetMouseButton(handle, GLFW.GLFW_MOUSE_BUTTON_LEFT) == GLFW.GLFW_PRESS;
        boolean rmb = GLFW.glfwGetMouseButton(handle, GLFW.GLFW_MOUSE_BUTTON_RIGHT) == GLFW.GLFW_PRESS;

        int ks = 22;
        int gap = 3;
        int panelW = ks * 3 + gap * 2;
        int panelH = ks * 3 + gap * 2 + 25 + 3;
        int margin = 6;
        boolean rightSide = "Bottom right".equals(position.get());
        int x0 = rightSide ? scaledWidth - margin - panelW : margin;
        int y0 = scaledHeight - margin - panelH;

        Ui.shadow(ctx, x0, y0, x0 + panelW, y0 + panelH, 8);
        Ui.fillRound(ctx, x0, y0, x0 + panelW, y0 + panelH, 8, 0x8F1C0F18);
        Ui.fillRound(ctx, x0, y0, x0 + panelW, y0 + 2, 8, Ui.ROSE);

        key(ctx, x0 + ks + gap, y0 + 4, ks, ks, "W", fwd);
        key(ctx, x0, y0 + 4 + ks + gap, ks, ks, "A", left);
        key(ctx, x0 + ks + gap, y0 + 4 + ks + gap, ks, ks, "S", back);
        key(ctx, x0 + 2 * (ks + gap), y0 + 4 + ks + gap, ks, ks, "D", right);
        key(ctx, x0, y0 + 4 + 2 * (ks + gap), ks, ks, "L", lmb);
        key(ctx, x0 + 2 * (ks + gap), y0 + 4 + 2 * (ks + gap), ks, ks, "R", rmb);
        key(ctx, x0, y0 + 4 + 3 * (ks + gap) - gap, panelW, ks - 8, jump ? "\u25b2" : " ", jump);
    }
}
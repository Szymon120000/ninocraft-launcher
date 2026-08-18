package ninocraft.modules.modules;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.text.Text;
import ninocraft.modules.Module;
import ninocraft.modules.ModuleOption;
import ninocraft.modules.Ui;

import java.util.ArrayList;
import java.util.List;

public class HudModule extends Module {
    private final ModuleOption.BoolOption coords = new ModuleOption.BoolOption("coords", "Coordinates", true);
    private final ModuleOption.BoolOption fps = new ModuleOption.BoolOption("fps", "FPS", true);
    private final ModuleOption.BoolOption facing = new ModuleOption.BoolOption("facing", "Direction", true);
    private final ModuleOption.BoolOption ping = new ModuleOption.BoolOption("ping", "Ping", false);
    private final ModuleOption.ChoiceOption position = new ModuleOption.ChoiceOption("position", "Position", "Top left", "Top left", "Top right");

    public HudModule() {
        super("hud", "HUD", "Shows FPS, coordinates and direction.");
        addOption(coords);
        addOption(fps);
        addOption(facing);
        addOption(ping);
        addOption(position);
    }

    @Override
    public void onRenderHud(DrawContext context, RenderTickCounter tickCounter, int scaledWidth, int scaledHeight) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player == null) return;

        List<String> lines = new ArrayList<>();
        if (fps.get()) lines.add("FPS " + client.getCurrentFps());
        if (ping.get() && client.getNetworkHandler() != null) {
            var entry = client.getNetworkHandler().getPlayerListEntry(client.player.getUuid());
            if (entry != null) lines.add("Ping " + entry.getLatency() + "ms");
        }
        if (coords.get()) {
            var p = client.player.getBlockPos();
            lines.add(String.format("X %d  Y %d  Z %d", p.getX(), p.getY(), p.getZ()));
        }
        if (facing.get()) {
            String dir = switch (client.player.getHorizontalFacing()) {
                case NORTH -> "N";
                case SOUTH -> "S";
                case EAST -> "E";
                default -> "W";
            };
            String dim = client.player.getEntityWorld().getRegistryKey().getValue().getPath();
            lines.add(dir + "  " + dim);
        }
        if (lines.isEmpty()) return;

        int textW = 0;
        for (String l : lines) {
            textW = Math.max(textW, client.textRenderer.getWidth(l));
        }
        int panelW = textW + 14;
        int panelH = lines.size() * 9 + 10;
        boolean right = "Top right".equals(position.get());
        int x0 = right ? scaledWidth - panelW - 4 : 4;
        int y0 = 4;

        Ui.shadow(context, x0, y0, x0 + panelW, y0 + panelH, 8);
        Ui.fillRound(context, x0, y0, x0 + panelW, y0 + panelH, 8, 0xC81C0F18);
        Ui.fillRound(context, x0, y0, x0 + panelW, y0 + 2, 8, Ui.ROSE);

        int ty = y0 + 7;
        for (String l : lines) {
            context.drawText(client.textRenderer, Text.literal(l), x0 + 7, ty, 0xFFFFD9E2, true);
            ty += 9;
        }
    }
}
package ninocraft.modules.modules;

import net.minecraft.client.MinecraftClient;
import ninocraft.modules.Module;

public class AutoWalkModule extends Module {
    public AutoWalkModule() {
        super("autowalk", "Auto Walk", "Walks forward automatically while enabled.");
    }

    @Override
    protected void onEnable() {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client != null && client.options != null) {
            client.options.forwardKey.setPressed(true);
        }
    }

    @Override
    protected void onDisable() {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client != null && client.options != null) {
            client.options.forwardKey.setPressed(false);
        }
    }
}
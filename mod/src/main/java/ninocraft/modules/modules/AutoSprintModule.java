package ninocraft.modules.modules;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ClientPlayerEntity;
import ninocraft.modules.Module;

public class AutoSprintModule extends Module {
    public AutoSprintModule() {
        super("autosprint", "Auto Sprint", "Sprints automatically while moving forward.");
    }

    @Override
    public void onTick(MinecraftClient client) {
        ClientPlayerEntity player = client.player;
        if (player == null) return;
        boolean forward = client.options.forwardKey.isPressed();
        boolean sneak = client.options.sneakKey.isPressed();
        if (forward && !sneak) {
            player.setSprinting(true);
        }
    }
}

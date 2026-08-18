package ninocraft.modules.modules;

import net.minecraft.client.MinecraftClient;
import ninocraft.modules.Module;
import ninocraft.modules.ModuleOption;

public class FullbrightModule extends Module {
    private double previousGamma = -1;
    private final ModuleOption.FloatOption intensity = new ModuleOption.FloatOption("intensity", "Brightness", 15f, 5f, 15f, 1f);

    public FullbrightModule() {
        super("fullbright", "Fullbright", "Makes the night as bright as day.");
        addOption(intensity);
    }

    private void apply() {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client == null || client.options == null) return;
        client.options.getGamma().setValue((double) intensity.get());
    }

    @Override
    protected void onEnable() {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client == null || client.options == null) return;
        previousGamma = client.options.getGamma().getValue();
        apply();
    }

    @Override
    protected void onDisable() {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client == null || client.options == null) return;
        if (previousGamma >= 0) {
            client.options.getGamma().setValue(previousGamma);
            previousGamma = -1;
        }
    }

    @Override
    public void onTick(MinecraftClient client) {
        if (client != null && client.options != null) {
            apply();
        }
    }
}
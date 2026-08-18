package ninocraft.modules.modules;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.GameOptions;
import net.minecraft.client.option.KeyBinding;
import ninocraft.modules.Module;
import ninocraft.modules.ModuleOption;
import org.lwjgl.glfw.GLFW;

public class ZoomModule extends Module {
    public static final ZoomModule INSTANCE = new ZoomModule();

    public final ModuleOption.BoolOption toggleMode = new ModuleOption.BoolOption("toggle", "Toggle mode", false);
    public final ModuleOption.FloatOption strength = new ModuleOption.FloatOption("strength", "Zoom strength", 0.3f, 0.05f, 0.9f, 0.05f);

    private KeyBinding zoomKey;
    private boolean toggled = false;

    public ZoomModule() {
        super("zoom", "Zoom", "Zoom in while holding the zoom key.");
        addOption(toggleMode);
        addOption(strength);
    }

    public void setZoomKey(KeyBinding key) {
        this.zoomKey = key;
    }

    public boolean isActive() {
        if (!isEnabled()) return false;
        if (zoomKey == null) return false;
        if (toggleMode.get()) {
            return toggled;
        }
        return zoomKey.isPressed();
    }

    public double getMultiplier() {
        return 1.0 - strength.get();
    }

    @Override
    public void onTick(MinecraftClient client) {
        if (zoomKey == null || !toggleMode.get()) return;
        if (zoomKey.wasPressed()) toggled = !toggled;
    }

    @Override
    protected void onDisable() {
        toggled = false;
    }
}

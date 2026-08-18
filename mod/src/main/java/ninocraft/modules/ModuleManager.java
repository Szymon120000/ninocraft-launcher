package ninocraft.modules;

import ninocraft.modules.modules.AutoSprintModule;
import ninocraft.modules.modules.AutoWalkModule;
import ninocraft.modules.modules.FirelessModule;
import ninocraft.modules.modules.FullbrightModule;
import ninocraft.modules.modules.HudModule;
import ninocraft.modules.modules.KeystrokesModule;
import ninocraft.modules.modules.TimeChangerModule;
import ninocraft.modules.modules.WeatherModule;
import ninocraft.modules.modules.ZoomModule;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class ModuleManager {
    private static final List<Module> MODULES = new ArrayList<>();

    private ModuleManager() {}

    public static void init() {
        register(new FullbrightModule());
        register(new AutoSprintModule());
        register(ZoomModule.INSTANCE);
        register(new HudModule());
        register(new FirelessModule());
        register(new KeystrokesModule());
        register(new AutoWalkModule());
        register(WeatherModule.INSTANCE);
        register(TimeChangerModule.INSTANCE);
        NinoConfig.load();
    }

    private static void register(Module m) {
        MODULES.add(m);
    }

    public static List<Module> getModules() {
        return Collections.unmodifiableList(MODULES);
    }

    public static Module byId(String id) {
        for (Module m : MODULES) {
            if (m.getId().equals(id)) return m;
        }
        return null;
    }

    public static void save() {
        NinoConfig.save();
    }

    public static void tickAll(net.minecraft.client.MinecraftClient client) {
        for (Module m : MODULES) {
            if (m.isEnabled()) m.onTick(client);
        }
    }
}

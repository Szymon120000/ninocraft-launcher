package ninocraft.modules;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.util.Identifier;
import ninocraft.modules.modules.ZoomModule;
import org.lwjgl.glfw.GLFW;

public class NinocraftModulesClient implements ClientModInitializer {
    private static KeyBinding menuKey;
    private static KeyBinding zoomKey;
    private static final KeyBinding.Category CATEGORY = KeyBinding.Category.create(Identifier.of("ninocraft-modules", "category"));

    @Override
    public void onInitializeClient() {
        menuKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.ninocraft.menu", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_RIGHT_SHIFT, CATEGORY));
        zoomKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.ninocraft.zoom", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_C, CATEGORY));

        ModuleManager.init();
        ZoomModule.INSTANCE.setZoomKey(zoomKey);

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            if (menuKey.wasPressed()) {
                if (client.currentScreen instanceof ModuleScreen) {
                    client.setScreen(null);
                } else {
                    client.setScreen(new ModuleScreen());
                }
            }
            ModuleManager.tickAll(client);
        });

        HudRenderCallback.EVENT.register((context, tickCounter) -> {
            for (Module m : ModuleManager.getModules()) {
                if (m.isEnabled()) {
                    m.onRenderHud(context, tickCounter,
                            context.getScaledWindowWidth(), context.getScaledWindowHeight());
                }
            }
        });
    }
}
package ninocraft.modules;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;

import java.util.ArrayList;
import java.util.List;

public abstract class Module {
    protected final String id;
    protected final String name;
    protected final String description;
    protected boolean enabled;
    protected final List<ModuleOption<?>> options = new ArrayList<>();

    protected Module(String id, String name, String description) {
        this.id = id;
        this.name = name;
        this.description = description;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public boolean isEnabled() { return enabled; }
    public List<ModuleOption<?>> getOptions() { return options; }

    public void setEnabled(boolean on) {
        if (enabled == on) return;
        enabled = on;
        if (on) onEnable(); else onDisable();
        ModuleManager.save();
    }

    protected <T> ModuleOption<T> addOption(ModuleOption<T> option) {
        options.add(option);
        return option;
    }

    protected void onEnable() {}
    protected void onDisable() {}
    public void onTick(MinecraftClient client) {}
    public void onRenderHud(DrawContext context, RenderTickCounter tickCounter, int scaledWidth, int scaledHeight) {}
}

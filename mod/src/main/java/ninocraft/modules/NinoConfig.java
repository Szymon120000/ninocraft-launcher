package ninocraft.modules;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public final class NinoConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private NinoConfig() {}

    private static Path file() {
        return FabricLoader.getInstance().getConfigDir().resolve("ninocraft-modules.json");
    }

    public static void load() {
        try {
            JsonObject root = GSON.fromJson(Files.readString(file()), JsonObject.class);
            if (root == null) return;
            JsonArray arr = root.getAsJsonArray("modules");
            if (arr == null) return;
            for (JsonElement e : arr) {
                if (!e.isJsonObject()) continue;
                JsonObject m = e.getAsJsonObject();
                Module module = ModuleManager.byId(m.get("id").getAsString());
                if (module == null) continue;
                if (m.has("enabled") && m.get("enabled").getAsBoolean()) {
                    module.setEnabled(true);
                }
                if (m.has("options") && m.get("options").isJsonObject()) {
                    JsonObject opts = m.getAsJsonObject("options");
                    for (ModuleOption<?> o : module.getOptions()) {
                        JsonElement v = opts.get(o.getId());
                        if (v == null) continue;
                        if (o instanceof ModuleOption.BoolOption b) b.set(v.getAsBoolean());
                        else if (o instanceof ModuleOption.FloatOption f) f.set(v.getAsFloat());
                        else if (o instanceof ModuleOption.ChoiceOption c) c.set(v.getAsString());
                    }
                }
            }
        } catch (IOException ignored) {
        }
    }

    public static void save() {
        JsonObject root = new JsonObject();
        JsonArray arr = new JsonArray();
        for (Module module : ModuleManager.getModules()) {
            JsonObject m = new JsonObject();
            m.addProperty("id", module.getId());
            m.addProperty("enabled", module.isEnabled());
            JsonObject opts = new JsonObject();
            for (ModuleOption<?> o : module.getOptions()) {
                if (o instanceof ModuleOption.BoolOption b) opts.addProperty(o.getId(), b.get());
                else if (o instanceof ModuleOption.FloatOption f) opts.addProperty(o.getId(), f.get());
                else if (o instanceof ModuleOption.ChoiceOption c) opts.addProperty(o.getId(), c.get());
            }
            m.add("options", opts);
            arr.add(m);
        }
        root.add("modules", arr);
        try {
            Files.writeString(file(), GSON.toJson(root), StandardCharsets.UTF_8);
        } catch (IOException ignored) {
        }
    }
}

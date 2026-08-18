package ninocraft.modules.modules;

import ninocraft.modules.Module;
import ninocraft.modules.ModuleOption;

public class WeatherModule extends Module {
    public static final WeatherModule INSTANCE = new WeatherModule();

    private final ModuleOption.BoolOption rain = new ModuleOption.BoolOption("rain", "No rain", true);
    private final ModuleOption.BoolOption thunder = new ModuleOption.BoolOption("thunder", "No thunder", true);

    public WeatherModule() {
        super("weather", "No Weather", "Turns off rain and thunder on the client.");
        addOption(rain);
        addOption(thunder);
    }

    public boolean suppressRain() {
        return isEnabled() && rain.get();
    }

    public boolean suppressThunder() {
        return isEnabled() && thunder.get();
    }
}
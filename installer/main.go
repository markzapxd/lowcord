package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

const (
	colorReset  = "\033[0m"
	colorRed    = "\033[1;31m"
	colorGreen  = "\033[1;32m"
	colorYellow = "\033[1;33m"
	colorCyan   = "\033[1;36m"
	colorBold   = "\033[1m"
)

type DiscordInstall struct {
	Name    string
	Path    string
	Folder  string
}

func printBanner() {
	fmt.Println()
	fmt.Println(colorCyan + colorBold)
	fmt.Println("  ╔══════════════════════════════════════╗")
	fmt.Println("  ║         LowCord Installer            ║")
	fmt.Println("  ║    Discord Client Mod Injector       ║")
	fmt.Println("  ╚══════════════════════════════════════╝")
	fmt.Println(colorReset)
}

func printStep(step, total, msg string) {
	fmt.Printf(colorGreen+"[%s/%s] "+colorReset+colorBold+"%s"+colorReset+"\n", step, total, msg)
}

func printSkip(step, total, msg string) {
	fmt.Printf(colorYellow+"[%s/%s] "+colorReset+"%s\n", step, total, msg)
}

func printError(msg string) {
	fmt.Printf(colorRed+"[ERRO] %s"+colorReset+"\n", msg)
}

func printSuccess(msg string) {
	fmt.Printf(colorGreen+"\n[OK] %s"+colorReset+"\n", msg)
}

func commandExists(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

func getVersion(name string) string {
	cmd := exec.Command(name, "--version")
	out, err := cmd.Output()
	if err != nil {
		return "desconhecida"
	}
	return strings.TrimSpace(string(out))
}

func runCommand(name string, args []string, workDir string) error {
	cmd := exec.Command(name, args...)
	cmd.Dir = workDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	return cmd.Run()
}

// Detecta todas as instalações do Discord no Windows
func detectDiscordInstalls() []DiscordInstall {
	var installs []DiscordInstall

	if runtime.GOOS != "windows" {
		return installs
	}

	localAppData := os.Getenv("LOCALAPPDATA")
	programFiles := os.Getenv("PROGRAMFILES")
	programFilesX86 := os.Getenv("PROGRAMFILES(X86)")

	// Nome → pasta de instalação
	discordVariants := map[string][]string{
		"Discord Stable": {
			filepath.Join(localAppData, "Discord"),
			filepath.Join(programFiles, "Discord"),
			filepath.Join(programFilesX86, "Discord"),
		},
		"Discord PTB": {
			filepath.Join(localAppData, "DiscordPTB"),
			filepath.Join(programFiles, "DiscordPTB"),
			filepath.Join(programFilesX86, "DiscordPTB"),
		},
		"Discord Canary": {
			filepath.Join(localAppData, "DiscordCanary"),
			filepath.Join(programFiles, "DiscordCanary"),
			filepath.Join(programFilesX86, "DiscordCanary"),
		},
		"Discord Development": {
			filepath.Join(localAppData, "DiscordDevelopment"),
		},
		"Vesktop": {
			filepath.Join(localAppData, "Vesktop"),
		},
		"Equibop": {
			filepath.Join(localAppData, "Equibop"),
		},
	}

	for name, paths := range discordVariants {
		for _, p := range paths {
			updateExe := filepath.Join(p, "Update.exe")
			discordExe := filepath.Join(p, "Discord.exe")
			if _, err := os.Stat(updateExe); err == nil {
				installs = append(installs, DiscordInstall{Name: name, Path: updateExe, Folder: p})
				break
			}
			if _, err := os.Stat(discordExe); err == nil {
				installs = append(installs, DiscordInstall{Name: name, Path: discordExe, Folder: p})
				break
			}
		}
	}

	return installs
}

func selectDiscord() *DiscordInstall {
	installs := detectDiscordInstalls()

	if len(installs) == 0 {
		fmt.Println(colorRed + "  Nenhuma instalação do Discord encontrada!" + colorReset)
		fmt.Println("  Baixe em: https://discord.com")
		return nil
	}

	if len(installs) == 1 {
		fmt.Printf(colorGreen+"  ✓ Discord encontrado: %s"+colorReset+"\n\n", installs[0].Name)
		return &installs[0]
	}

	// Múltiplas instalações — mostra menu
	fmt.Println(colorBold + "  Discords encontrados:" + colorReset)
	fmt.Println()
	for i, inst := range installs {
		fmt.Printf(colorCyan+"    [%d]"+colorReset+" %s\n", i+1, inst.Name)
		fmt.Printf(colorYellow+"        → %s"+colorReset+"\n", inst.Folder)
	}
	fmt.Println()
	fmt.Print(colorBold + "  Selecione o Discord (1-" + strconv.Itoa(len(installs)) + "): " + colorReset)

	reader := bufio.NewReader(os.Stdin)
	input, _ := reader.ReadString('\n')
	input = strings.TrimSpace(input)

	choice, err := strconv.Atoi(input)
	if err != nil || choice < 1 || choice > len(installs) {
		fmt.Printf(colorRed+"\n  Opção inválida. Usando: %s"+colorReset+"\n", installs[0].Name)
		return &installs[0]
	}

	fmt.Printf(colorGreen+"\n  ✓ Selecionado: %s"+colorReset+"\n\n", installs[choice-1].Name)
	return &installs[choice-1]
}

func checkPrerequisites(workDir string) bool {
	allGood := true

	fmt.Println(colorBold + "  Verificando pré-requisitos..." + colorReset)
	fmt.Println()

	// Check Git
	if commandExists("git") {
		fmt.Printf("  "+colorGreen+"✓"+colorReset+" Git (%s)\n", getVersion("git"))
	} else {
		fmt.Printf("  "+colorRed+"✗"+colorReset+" Git NÃO encontrado\n")
		fmt.Println("    → Baixe em: https://git-scm.com")
		allGood = false
	}

	// Check Node.js
	if commandExists("node") {
		ver := getVersion("node")
		fmt.Printf("  "+colorGreen+"✓"+colorReset+" Node.js (%s)\n", ver)
	} else {
		fmt.Printf("  "+colorRed+"✗"+colorReset+" Node.js NÃO encontrado\n")
		fmt.Println("    → Baixe em: https://nodejs.org (versão LTS)")
		allGood = false
	}

	// Check npm (vem com Node)
	if commandExists("npm") {
		fmt.Printf("  "+colorGreen+"✓"+colorReset+" npm (%s)\n", getVersion("npm"))
	} else {
		fmt.Printf("  "+colorRed+"✗"+colorReset+" npm NÃO encontrado\n")
		fmt.Println("    → Geralmente vem com o Node.js")
		allGood = false
	}

	// Check pnpm
	if commandExists("pnpm") {
		fmt.Printf("  "+colorGreen+"✓"+colorReset+" pnpm (%s)\n", getVersion("pnpm"))
	} else {
		fmt.Printf("  "+colorYellow+"?"+colorReset+" pnpm não encontrado — instalando...\n")
		if err := runCommand("npm", []string{"i", "-g", "pnpm"}, workDir); err != nil {
			fmt.Printf("  "+colorRed+"✗"+colorReset+" Falha ao instalar pnpm\n")
			allGood = false
		} else {
			fmt.Printf("  "+colorGreen+"✓"+colorReset+" pnpm instalado com sucesso\n")
		}
	}

	fmt.Println()

	if !allGood {
		fmt.Println(colorRed + "  Instale os pré-requisitos faltantes e tente novamente." + colorReset)
		fmt.Println()
	}

	return allGood
}

func main() {
	workDir, _ := os.Getwd()

	printBanner()

	// Verificar pré-requisitos
	if !checkPrerequisites(workDir) {
		fmt.Println("  Pressione Enter para sair...")
		fmt.Scanln()
		return
	}

	// Selecionar Discord
	discord := selectDiscord()
	if discord == nil {
		fmt.Println("  Pressione Enter para sair...")
		fmt.Scanln()
		return
	}

	total := "3"

	// [1/3] Instalar dependências
	nodeModulesPath := filepath.Join(workDir, "node_modules")
	if _, err := os.Stat(nodeModulesPath); os.IsNotExist(err) {
		printStep("1", total, "Instalando dependências...")
		if err := runCommand("pnpm", []string{"install", "--frozen-lockfile"}, workDir); err != nil {
			printError("Falha ao instalar dependências")
			fmt.Println("  Pressione Enter para sair...")
			fmt.Scanln()
			return
		}
	} else {
		printSkip("1", total, "Dependências já instaladas")
	}

	// [2/3] Build
	printStep("2", total, "Buildando o projeto...")
	if err := runCommand("pnpm", []string{"build"}, workDir); err != nil {
		printError("Falha no build")
		fmt.Println("  Pressione Enter para sair...")
		fmt.Scanln()
		return
	}

	// [3/3] Inject — passa o Discord selecionado
	printStep("3", total, "Injetando no Discord ("+discord.Name+")...")

	// Equilotl usa --discord-path para especificar o Discord
	args := []string{"inject", "--discord-path", discord.Folder}
	if err := runCommand("pnpm", args, workDir); err != nil {
		// Se falhar com --discord-path, tenta sem (compatibilidade)
		printError("Falha ao injetar. Tentando detecção automática...")
		if err := runCommand("pnpm", []string{"inject"}, workDir); err != nil {
			printError("Falha ao injetar")
			fmt.Println("  Pressione Enter para sair...")
			fmt.Scanln()
			return
		}
	}

	printSuccess("Instalação concluída!")
	fmt.Printf("  Discord: %s\n", discord.Name)
	fmt.Printf("  Caminho: %s\n", discord.Folder)
	fmt.Println("  Reinicie o Discord para ativar o LowCord.")
	fmt.Println()
	fmt.Println("  Pressione Enter para sair...")
	fmt.Scanln()
}

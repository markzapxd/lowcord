#!/bin/bash
# Build script para o LowCord Installer com ícone

set -e

echo ""
echo "  Compilando LowCord Installer..."
echo ""

cd "$(dirname "$0")"

# 1. Verifica se tem ícone
if [ ! -f "icon.png" ]; then
    echo "  [!] icon.png não encontrado em installer/"
    echo "  Coloque seu ícone .png nessa pasta e rode de novo."
    echo ""
    echo "  Gerando .exe sem ícone..."
    echo ""
fi

# 2. Instala go-winres se necessário
if ! command -v go-winres &> /dev/null; then
    echo "  Instalando go-winres..."
    go install github.com/tc-hib/go-winres@latest
fi

# 3. Gera os arquivos .syso (se tiver icon.png)
if [ -f "icon.png" ]; then
    echo "  Gerando recursos Windows..."
    go-winres generate --json winres.json --output .. 2>/dev/null || true
fi

# 4. Compila pra Windows
echo "  Compilando binário..."
GOOS=windows GOARCH=amd64 go build -o ../LowCord-Installer.exe -ldflags="-s -w -H windowsgui" main.go

# 5. Limpa os .syso gerados
rm -f ../*.syso 2>/dev/null || true

if [ $? -eq 0 ]; then
    echo ""
    echo "  ✓ LowCord-Installer.exe gerado com sucesso!"
    echo ""
    ls -lh ../LowCord-Installer.exe
else
    echo "  ✗ Erro ao compilar"
    exit 1
fi

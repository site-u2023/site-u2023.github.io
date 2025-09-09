function setupLanguageSelector() {
    const mainLanguageSelect = document.querySelector('#languages-select');
    const customLanguageSelect = document.querySelector('#aios-language');
    const fallback = config?.fallback_language || 'en';
    
    // 現在のデバイス用言語を決定（ブラウザ言語とは独立）
    let deviceLanguage = fallback;
    if (current_language) {
        deviceLanguage = current_language;
    }
    
    // グローバル変数を確実に設定（デバイス用言語）
    selectedLanguage = deviceLanguage;
    window.selectedLanguage = deviceLanguage; // グローバルスコープにも設定
    console.log('Selected language for device:', selectedLanguage);
    
    // カスタム言語セレクター（デバイス用）を設定
    if (customLanguageSelect && customLanguageSelect.value !== selectedLanguage) {
        customLanguageSelect.value = selectedLanguage;
        console.log('Set device language selector to:', selectedLanguage);
    }
    
    // イベントリスナー設定
    
    // メイン言語セレクターの変更を監視（ブラウザUI表示のみ）
    if (mainLanguageSelect) {
        // 既存のリスナーを削除してから追加（重複防止）
        mainLanguageSelect.removeEventListener('change', handleMainLanguageChange);
        mainLanguageSelect.addEventListener('change', handleMainLanguageChange);
    }
    
    // カスタム言語セレクターの変更を監視（デバイス用言語の変更）
    if (customLanguageSelect) {
        customLanguageSelect.removeEventListener('change', handleCustomLanguageChange);
        customLanguageSelect.addEventListener('change', handleCustomLanguageChange);
    }
    
    // 初回言語パッケージ更新（重要：必ず実行）
    console.log('Performing initial language package update for:', selectedLanguage);
    if (selectedLanguage && selectedLanguage !== 'en') {
        // 英語以外の場合は必ず言語パッケージを追加
        updateLanguagePackage();
    }
}

import EmojiPicker, { Categories, EmojiStyle, SuggestionMode, Theme } from 'emoji-picker-react';
import portugueseEmojiData from 'emoji-picker-react/dist/data/emojis-pt';

type Props = {
  dark: boolean;
  onSelect: (emoji: string) => void;
};

export default function NativeEmojiPicker({ dark, onSelect }: Props) {
  return (
    <EmojiPicker
      autoFocusSearch
      categories={[
        { category: Categories.SUGGESTED, name: 'Recentes' },
        { category: Categories.SMILEYS_PEOPLE, name: 'Carinhas e pessoas' },
        { category: Categories.ANIMALS_NATURE, name: 'Animais e natureza' },
        { category: Categories.FOOD_DRINK, name: 'Comidas e bebidas' },
        { category: Categories.TRAVEL_PLACES, name: 'Viagens e lugares' },
        { category: Categories.ACTIVITIES, name: 'Atividades' },
        { category: Categories.OBJECTS, name: 'Objetos' },
        { category: Categories.SYMBOLS, name: 'Símbolos' },
        { category: Categories.FLAGS, name: 'Bandeiras' },
      ]}
      className="raddo-emoji-picker"
      emojiData={portugueseEmojiData}
      emojiStyle={EmojiStyle.NATIVE}
      height="min(60dvh, 480px)"
      lazyLoadEmojis
      onEmojiClick={(emojiData) => onSelect(emojiData.emoji)}
      previewConfig={{ showPreview: false }}
      searchClearButtonLabel="Limpar pesquisa"
      searchPlaceholder="Pesquisar emoji..."
      suggestedEmojisMode={SuggestionMode.RECENT}
      theme={dark ? Theme.DARK : Theme.LIGHT}
      width="100%"
    />
  );
}

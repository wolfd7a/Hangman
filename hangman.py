def hangman() :
    word = 'sir'
    wordletters=list(word)
    print(wordletters)
    usedletters=[]
    correctletters=[]
    counter=10
    while counter>0 :
        if ''.join(correctletters)==''.join(wordletters):
            print('You won ! '+str(word)+' was the correct word.')
            break
        else :
            letter = input('Input a letter :')
            try :
                letter not in (usedletters)
                if letter in (wordletters):
                    usedletters.append(letter)
                    correctletters.append(letter)
                    continue
                else :
                    usedletters.append(letter)
                    counter-=1
                    print('This letter is not in the word I chose. '+str(counter)+' attempt(s) left')
                    continue
            except :
                print('This letter has already been chosen. Choose another one.')
    while counter==0 :
        print("No lives left. You've lost")
hangman()

def hangman() :
    wordletters=['d', 'o','o' 'r']
    usedletters=[]
    correctletters=[]
    counter=0
    while counter<11 :
        letter = input('Input a letter :')
        while (wordletters)!=(correctletters) :
            try :
                if letter not in (usedletters) :
                    usedletters.append(letter)
                    correctletters.append(letter)
                    break
                else :
                    print('This letter has already been chosen. Choose another one.')
            except :
                usedletters.append(letter)
                print('This letter is not in the word I chose.')
                counter+=1
                break
hangman()
